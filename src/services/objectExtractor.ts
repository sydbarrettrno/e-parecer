export interface SecaoParecer {
  key: string;
  titulo: string;
  texto: string;
  origem?: string;
  confianca?: string;
  oculto: boolean;
}

interface DadoExtraido {
  id: string;
  campo: string;
  valor: string;
  origem_documento?: string | null;
  confianca?: string | null;
}

interface Arquivo {
  nome_original: string;
  categoria?: string | null;
}

interface Processo {
  numero_processo: string;
  orgao: string;
  secretaria: string;
}

const campoLabels: Record<string, string> = {
  objeto_contratacao: "Objeto da Contratação",
  numero_processo: "Número do Processo",
  orgao_responsavel: "Órgão Responsável",
  secretaria_responsavel: "Secretaria Responsável",
  valor_estimado: "Valor Estimado",
  responsavel_tecnico: "Responsável Técnico",
  projetos_documentos: "Projetos e Documentos Técnicos",
  determinacao_custos: "Determinação dos Custos",
  oneracao_desoneracao: "Oneração / Desoneração",
  bdi: "BDI",
  cronograma: "Cronograma Físico-Financeiro",
};

export { campoLabels };

/** Campos que são mapeados diretamente para seções fixas (não geram subtópicos extras) */
const MAPPED_FIELDS = [
  "objeto_contratacao", "valor_estimado", "responsavel_tecnico",
  "numero_processo", "orgao_responsavel", "secretaria_responsavel",
  "projetos_documentos", "determinacao_custos", "oneracao_desoneracao",
  "bdi", "cronograma",
];

/**
 * Monta as seções do Parecer Técnico na estrutura institucional obrigatória:
 *
 * 1. IDENTIFICAÇÃO E OBJETO
 * 2. DOCUMENTOS ANALISADOS
 * 3. ASSUNTO
 * 4. CONSIDERAÇÕES INICIAIS
 * 5. FUNDAMENTAÇÃO TÉCNICA (subtópicos variáveis)
 * 6. CONCLUSÃO – PARECER TÉCNICO
 * 7. FECHAMENTO FORMAL
 */
export function buildSecoesFromData(
  processo: Processo,
  dadosExtraidos: DadoExtraido[],
  arquivos: Arquivo[]
): SecaoParecer[] {
  const dadosMap: Record<string, { valor: string; origem?: string; confianca?: string }> = {};
  dadosExtraidos.forEach((d) => {
    dadosMap[d.campo] = {
      valor: d.valor,
      origem: d.origem_documento ?? undefined,
      confianca: d.confianca ?? undefined,
    };
  });

  const docsList = arquivos
    .map((a, i) => `${i + 1}. ${a.nome_original} [${a.categoria || "OUTROS"}]`)
    .join("\n");

  const NOT_FOUND = "Não foi identificada informação correspondente nos documentos analisados.";

  // ── Seções fixas ──────────────────────────────────────────

  const secoes: SecaoParecer[] = [
    {
      key: "objeto",
      titulo: "1. IDENTIFICAÇÃO E OBJETO",
      texto: dadosMap["objeto_contratacao"]?.valor || NOT_FOUND,
      origem: dadosMap["objeto_contratacao"]?.origem,
      confianca: dadosMap["objeto_contratacao"]?.confianca,
      oculto: false,
    },
    {
      key: "documentos_analisados",
      titulo: "2. DOCUMENTOS ANALISADOS",
      texto: docsList || "Nenhum documento analisado.",
      oculto: false,
    },
    {
      key: "assunto",
      titulo: "3. ASSUNTO",
      texto: `Elaboração de Parecer Técnico para o material apresentado, visando instruir procedimento licitatório para execução de obra pública, conforme especificações constantes nas peças técnicas que integram o processo nº ${processo.numero_processo}.`,
      oculto: false,
    },
    {
      key: "consideracoes_iniciais",
      titulo: "4. CONSIDERAÇÕES INICIAIS",
      texto: "Este parecer tem por objetivo verificar se o conjunto documental apresentado possui completude, clareza e consistência documental para subsidiar a instrução do procedimento licitatório, à luz da Lei nº 14.133/2021.",
      oculto: false,
    },
  ];

  // ── 5. FUNDAMENTAÇÃO TÉCNICA – subtópicos variáveis ───────

  const subtopicosFixos: { key: string; label: string }[] = [
    { key: "projetos_documentos", label: "PROJETOS E DEMAIS DOCUMENTOS TÉCNICOS" },
    { key: "valor_estimado", label: "VALOR GLOBAL ORÇADO" },
    { key: "determinacao_custos", label: "DETERMINAÇÃO DOS CUSTOS" },
    { key: "oneracao_desoneracao", label: "ONERAÇÃO / DESONERAÇÃO" },
    { key: "bdi", label: "BDI" },
    { key: "cronograma", label: "CRONOGRAMA FÍSICO-FINANCEIRO E MEMORIAIS" },
  ];

  let subIdx = 1;
  for (const sub of subtopicosFixos) {
    secoes.push({
      key: sub.key,
      titulo: `5.${subIdx} ${sub.label}`,
      texto: dadosMap[sub.key]?.valor || NOT_FOUND,
      origem: dadosMap[sub.key]?.origem,
      confianca: dadosMap[sub.key]?.confianca,
      oculto: false,
    });
    subIdx++;
  }

  // Subtópicos extras vindos da IA (campos não mapeados)
  const extras = dadosExtraidos.filter((d) => !MAPPED_FIELDS.includes(d.campo));
  for (const d of extras) {
    secoes.push({
      key: `extra_${d.id}`,
      titulo: `5.${subIdx} ${campoLabels[d.campo] || d.campo.toUpperCase()}`,
      texto: d.valor,
      origem: d.origem_documento ?? undefined,
      confianca: d.confianca ?? undefined,
      oculto: false,
    });
    subIdx++;
  }

  // ── 6. CONCLUSÃO ──────────────────────────────────────────

  secoes.push({
    key: "conclusao",
    titulo: "6. CONCLUSÃO – PARECER TÉCNICO",
    texto: `Com base na análise técnica dos ${arquivos.length} documento(s) integrante(s) do processo administrativo nº ${processo.numero_processo}, conclui-se que o conjunto documental apresentado atende aos requisitos mínimos para instrução do procedimento licitatório, ressalvadas as observações registradas nos itens precedentes.\n\nÉ este o parecer.`,
    oculto: false,
  });

  // ── 7. FECHAMENTO FORMAL ──────────────────────────────────

  secoes.push({
    key: "fechamento_local_data",
    titulo: "7. LOCAL E DATA",
    texto: `${processo.orgao}, [data].`,
    oculto: false,
  });

  secoes.push({
    key: "fechamento_responsavel",
    titulo: "7. RESPONSÁVEL TÉCNICO",
    texto: dadosMap["responsavel_tecnico"]?.valor || "[Nome completo]",
    origem: dadosMap["responsavel_tecnico"]?.origem,
    confianca: dadosMap["responsavel_tecnico"]?.confianca,
    oculto: false,
  });

  secoes.push({
    key: "fechamento_cargo",
    titulo: "7. CARGO",
    texto: "[Cargo do responsável técnico]",
    oculto: false,
  });

  secoes.push({
    key: "fechamento_registro",
    titulo: "7. REGISTRO PROFISSIONAL",
    texto: "[CREA/CAU nº]",
    oculto: false,
  });

  return secoes;
}
