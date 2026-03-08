/**
 * Pipeline do Parecer Técnico
 *
 * Fluxo completo:
 *   1. Upload ZIP
 *   2. Extrair arquivos
 *   3. Classificar documentos
 *   4. Extrair informações principais (Edge Function / AI)
 *   5. Validação das informações (interação do usuário)
 *   6. Montar parecer técnico
 *   7. Gerar DOCX
 *
 * As etapas 1-4 são orquestradas por `executePipelineUpload`.
 * A etapa 5 é interativa (página Validacao).
 * As etapas 6-7 são orquestradas por `executePipelineFinalizacao`.
 */

import { supabase } from "@/integrations/supabase/client";
import { extractFilesFromZip, type ExtractedFile } from "./zipExtractor";
import { classifyDocument } from "./documentClassifier";
import { buildParecerConteudo } from "./parecerBuilder";
import { generateParecerDocx } from "./docxGenerator";
import type { SecaoParecer } from "./objectExtractor";
import {
  createProcesso,
  updateProcessoStatus,
} from "@/database/processos";
import { insertArquivo } from "@/database/arquivos";
import { uploadToStorage } from "@/database/storage";
import { insertParecer, fetchPareceres } from "@/database/pareceres";
import { fetchArquivos } from "@/database/arquivos";

// ─── Tipos ───────────────────────────────────────────────────

export interface ProcessoInput {
  nome_processo: string;
  numero_processo: string;
  orgao: string;
  secretaria: string;
}

export interface PipelineUploadResult {
  processoId: string;
}

// ─── Etapas 1-4: Upload → Extração → Classificação → Análise IA ─

export async function executePipelineUpload(
  input: ProcessoInput,
  zipFile: File
): Promise<PipelineUploadResult> {
  // 1. Criar processo no banco
  const processo = await createProcesso({
    ...input,
    status: "analisando",
  });

  // 2. Upload do ZIP original
  const zipPath = `${processo.id}/processo.zip`;
  await uploadToStorage("processos", zipPath, zipFile);

  // 3. Extrair arquivos do ZIP
  const extractedFiles = await extractFilesFromZip(zipFile);

  // 4. Upload individual + classificação + registro
  for (const ef of extractedFiles) {
    const storagePath = `${processo.id}/${ef.safeName}`;
    await uploadToStorage("processos", storagePath, ef.data);

    const categoria = classifyDocument(ef.name);
    await insertArquivo({
      processo_id: processo.id,
      nome_original: ef.name,
      extensao: ef.extension,
      storage_path: storagePath,
    });
  }

  // 5. Chamar Edge Function de análise (extração de informações via IA)
  const { error: fnError } = await supabase.functions.invoke(
    "analyze-documents",
    { body: { processo_id: processo.id } }
  );
  if (fnError) {
    console.error("Erro na análise:", fnError);
    // Não bloqueia — o usuário pode revisar manualmente
  }

  return { processoId: processo.id };
}

// ─── Etapas 6-7: Montar parecer → Gerar DOCX ────────────────

export interface FinalizacaoInput {
  processoId: string;
  processo: {
    nome_processo: string;
    numero_processo: string;
    orgao: string;
    secretaria: string;
  };
  secoes: SecaoParecer[];
}

export async function executePipelineFinalizacao(input: FinalizacaoInput) {
  const { processoId, processo, secoes } = input;

  // Buscar dados auxiliares
  const arquivos = await fetchArquivos(processoId);
  const pareceres = await fetchPareceres(processoId);
  const nextVersion = (pareceres?.[0]?.versao ?? 0) + 1;

  // 6. Montar conteúdo JSON do parecer
  const conteudo = buildParecerConteudo(
    processo,
    arquivos.map((a) => ({
      nome_original: a.nome_original,
      categoria: a.categoria,
    })),
    secoes,
    nextVersion
  );

  // Salvar no banco
  await insertParecer({
    processo_id: processoId,
    versao: nextVersion,
    conteudo_json: conteudo,
  });

  await updateProcessoStatus(processoId, "concluido");

  // 7. Gerar DOCX para download
  const versionStr = String(nextVersion).padStart(2, "0");
  await generateParecerDocx(conteudo, `PARECER_TECNICO_V${versionStr}.docx`);

  return { conteudo, version: nextVersion };
}
