import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

// ── Folder-path-based rules (highest priority) ──
const FOLDER_CATEGORY_MAP: Record<string, string> = {
  "/md/": "MEMORIAL_OU_TR",
  "/dre/": "DRENAGEM",
  "/cat/": "CADASTRO_TOPOGRAFIA",
  "/urb_sin/": "URBANIZACAO_SINALIZACAO",
  "/urb/": "URBANIZACAO_SINALIZACAO",
  "/sin/": "URBANIZACAO_SINALIZACAO",
  "/orc/": "ORCAMENTO",
  "/cro/": "CRONOGRAMA",
};

// ── Filename keyword rules ──
const FILENAME_RULES: [string, string][] = [
  ["cronograma", "CRONOGRAMA"],
  ["orcamento sintetico", "ORCAMENTO"],
  ["orc sintetico", "ORCAMENTO"],
  ["composicoes", "ORCAMENTO"],
  ["composicao", "ORCAMENTO"],
  ["curva abc", "ORCAMENTO"],
  ["memoria de calculo", "ORCAMENTO"],
  ["mem calculo", "ORCAMENTO"],
  ["cotacoes", "ORCAMENTO"],
  ["cotacao", "ORCAMENTO"],
  ["dmt", "ORCAMENTO"],
  ["bdi", "ORCAMENTO"],
  ["orcamento", "ORCAMENTO"],
  ["planilha", "ORCAMENTO"],
  ["sinapi", "ORCAMENTO"],
  ["memorial", "MEMORIAL_OU_TR"],
  ["termo de referencia", "MEMORIAL_OU_TR"],
  ["projeto basico", "MEMORIAL_OU_TR"],
  ["projeto executivo", "MEMORIAL_OU_TR"],
  ["drenagem", "DRENAGEM"],
  ["topografia", "CADASTRO_TOPOGRAFIA"],
  ["cadastro", "CADASTRO_TOPOGRAFIA"],
  ["planialtimetrico", "CADASTRO_TOPOGRAFIA"],
  ["levantamento", "CADASTRO_TOPOGRAFIA"],
  ["urbanizacao", "URBANIZACAO_SINALIZACAO"],
  ["sinalizacao", "URBANIZACAO_SINALIZACAO"],
  ["pavimentacao", "URBANIZACAO_SINALIZACAO"],
  ["art", "RESPONSABILIDADE_TECNICA"],
  ["rrt", "RESPONSABILIDADE_TECNICA"],
];

const normalize = (text: string) =>
  text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// ── Classification: folder path → filename keywords only (no content parsing needed) ──
function classifyDocument(filename: string): string {
  const normalizedPath = normalize(filename);

  // 1) Folder path (highest priority)
  for (const [folder, category] of Object.entries(FOLDER_CATEGORY_MAP)) {
    if (normalizedPath.includes(folder)) {
      return category;
    }
  }

  // 2) Filename keywords
  const normalizedFilename = normalize(filename.split("/").pop() || filename);
  for (const [pattern, category] of FILENAME_RULES) {
    if (normalizedFilename.includes(pattern)) {
      return category;
    }
  }

  return "OUTROS";
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { processo_id } = await req.json();
    if (!processo_id) {
      return new Response(JSON.stringify({ error: "processo_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { data: processo, error: procErr } = await supabase
      .from("processos")
      .select("*")
      .eq("id", processo_id)
      .single();
    if (procErr) throw procErr;

    const { data: arquivos, error: arqErr } = await supabase
      .from("arquivos")
      .select("*")
      .eq("processo_id", processo_id);
    if (arqErr) throw arqErr;

    // Classify each file by name/path only (no heavy PDF parsing)
    const classifiedFiles: { nome: string; categoria: string }[] = [];

    for (const arq of arquivos) {
      const categoria = classifyDocument(arq.nome_original);
      await supabase
        .from("arquivos")
        .update({ categoria })
        .eq("id", arq.id);
      classifiedFiles.push({ nome: arq.nome_original, categoria });
    }

    // Build discipline list from classified files
    const disciplineMap: Record<string, string> = {
      DRENAGEM: "drenagem",
      URBANIZACAO_SINALIZACAO: "urbanização e sinalização",
      CADASTRO_TOPOGRAFIA: "cadastro e topografia",
      MEMORIAL_OU_TR: "memorial descritivo",
      ORCAMENTO: "orçamento",
      CRONOGRAMA: "cronograma",
      RESPONSABILIDADE_TECNICA: "responsabilidade técnica",
    };
    const presentDisciplines = [...new Set(classifiedFiles.map((f) => f.categoria))]
      .filter((c) => disciplineMap[c])
      .map((c) => disciplineMap[c]);

    // Build file list summary for AI (just names + categories, no content)
    const fileSummary = classifiedFiles
      .map((f) => `- ${f.nome} → ${f.categoria}`)
      .join("\n");

    // ── AI prompt (lightweight, no file content) ──
    const prompt = `Você é um analista técnico de processos licitatórios de engenharia pública.

Com base nas informações do processo e nos NOMES E CATEGORIAS dos documentos classificados, extraia os dados abaixo.

INFORMAÇÕES DO PROCESSO:
- Nome: ${processo.nome_processo}
- Número: ${processo.numero_processo}
- Órgão: ${processo.orgao}
- Secretaria: ${processo.secretaria}

DOCUMENTOS CLASSIFICADOS:
${fileSummary}

DISCIPLINAS IDENTIFICADAS: ${presentDisciplines.join(", ") || "nenhuma identificada"}

CAMPOS A EXTRAIR:
1. objeto_contratacao - Construa uma descrição técnica do objeto. NÃO use apenas o nome do processo.
   Use as disciplinas identificadas e os nomes dos documentos para montar algo como:
   "Execução de serviços de pavimentação, drenagem, urbanização e sinalização da [local]"
   O nome do processo geralmente contém o nome da rua/local.

2. numero_processo - Número do processo (use: ${processo.numero_processo})
3. orgao_responsavel - Órgão responsável (use: ${processo.orgao})
4. secretaria_responsavel - Secretaria responsável (use: ${processo.secretaria})
5. valor_estimado - Se não há como saber sem ler o conteúdo dos documentos, use confiança "baixa"
6. responsavel_tecnico - Se não há como saber sem ler o conteúdo dos documentos, use confiança "baixa"

INSTRUÇÕES:
- Para objeto_contratacao, NUNCA retorne apenas o nome do processo. Sempre construa uma descrição técnica.
- Responda APENAS com um array JSON, sem markdown, sem explicações
- Formato: [{"campo":"...","valor":"...","origem_documento":"...","confianca":"alta|media|baixa"}]`;

    let extractedData: any[] = [];

    try {
      console.log("Calling Lovable AI gateway...");
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (aiResponse.ok) {
        const aiResult = await aiResponse.json();
        const content = aiResult.choices?.[0]?.message?.content || "";
        console.log("AI response received, length:", content.length);
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          extractedData = JSON.parse(jsonMatch[0]);
        }
      } else {
        console.error("AI gateway error:", aiResponse.status, await aiResponse.text());
      }
    } catch (aiErr) {
      console.error("AI analysis error:", aiErr);
    }

    // Fallback
    if (extractedData.length === 0) {
      const objetoFallback = presentDisciplines.length > 0
        ? `Execução de serviços de ${presentDisciplines.join(", ")} – ${processo.nome_processo}`
        : processo.nome_processo;

      extractedData = [
        { campo: "objeto_contratacao", valor: objetoFallback, origem_documento: "Inferido dos documentos classificados", confianca: "media" },
        { campo: "numero_processo", valor: processo.numero_processo, origem_documento: "Cadastro do processo", confianca: "alta" },
        { campo: "orgao_responsavel", valor: processo.orgao, origem_documento: "Cadastro do processo", confianca: "alta" },
        { campo: "secretaria_responsavel", valor: processo.secretaria, origem_documento: "Cadastro do processo", confianca: "alta" },
        { campo: "valor_estimado", valor: "Não foi identificada informação correspondente nos documentos analisados.", origem_documento: null, confianca: "baixa" },
        { campo: "responsavel_tecnico", valor: "Não foi identificada informação correspondente nos documentos analisados.", origem_documento: null, confianca: "baixa" },
      ];
    }

    // Clear old extracted data & insert new
    await supabase.from("dados_extraidos").delete().eq("processo_id", processo_id);

    for (const item of extractedData) {
      await supabase.from("dados_extraidos").insert({
        processo_id,
        campo: item.campo,
        valor: item.valor,
        origem_documento: item.origem_documento || null,
        confianca: item.confianca || "media",
      });
    }

    await supabase
      .from("processos")
      .update({ status: "revisao" })
      .eq("id", processo_id);

    return new Response(
      JSON.stringify({
        success: true,
        extracted: extractedData.length,
        filesProcessed: arquivos.length,
        classifications: classifiedFiles,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);

    // Try to set error status
    try {
      const { processo_id } = await req.clone().json().catch(() => ({}));
      if (processo_id) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        await supabase.from("processos").update({ status: "erro" }).eq("id", processo_id);
      }
    } catch (_) { /* ignore */ }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
