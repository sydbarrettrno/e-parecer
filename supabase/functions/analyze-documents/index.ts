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

const normalize = (text: string) =>
  text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// ── Classification engine ──
function classifyDocument(filename: string): string {
  const normalizedPath = normalize(filename);
  const normalizedFilename = normalize(filename.split("/").pop() || filename);

  // 1) Exclusion rules first — RRC is NOT ART/RRT
  if (normalizedFilename.includes("rrc")) return "OUTROS";

  // 2) High-priority filename keyword rules
  // Administrative
  if (normalizedFilename.includes("declinando") || normalizedFilename.includes("sem devolucao")) return "ADMINISTRATIVO";

  // Template/Model
  if (normalizedFilename.includes("template") || normalizedFilename.includes("modelo")) return "MODELO";

  // Cronograma (before ORC folder can catch it)
  if (normalizedFilename.includes("cronograma")) return "CRONOGRAMA";

  // Responsabilidade técnica — only exact ART/RRT patterns
  // Use word-boundary-like matching to avoid false positives (e.g. "carta", "art.")
  if (/\bart\b/.test(normalizedFilename) || /\brrt\b/.test(normalizedFilename)) return "RESPONSABILIDADE_TECNICA";

  // Cotações / Propostas
  if (normalizedFilename.includes("proposta") || normalizedFilename.includes("cotacao") || normalizedFilename.includes("cotacoes") || normalizedFilename.includes("orca recebido")) return "COTACAO_OU_PROPOSTA";

  // Termo de referência — check filename for "tr" as word boundary or full phrase
  if (/\btr\b/.test(normalizedFilename) || normalizedFilename.includes("termo de referencia")) return "TERMO_DE_REFERENCIA";

  // Orçamento keywords
  if (normalizedFilename.includes("orcamento") || normalizedFilename.includes("orca") || normalizedFilename.includes("planilha") || normalizedFilename.includes("composicoes") || normalizedFilename.includes("composicao") || normalizedFilename.includes("curva abc") || normalizedFilename.includes("memoria de calculo") || normalizedFilename.includes("mem calculo") || normalizedFilename.includes("dmt") || normalizedFilename.includes("bdi") || normalizedFilename.includes("sinapi") || normalizedFilename.includes("sintetico")) return "ORCAMENTO";

  // Memorial descritivo
  if (normalizedFilename.includes("memorial") || normalizedFilename.includes("projeto basico") || normalizedFilename.includes("projeto executivo")) return "MEMORIAL_OU_TR";

  // Technical disciplines
  if (normalizedFilename.includes("drenagem")) return "DRENAGEM";
  if (normalizedFilename.includes("topografia") || normalizedFilename.includes("cadastro") || normalizedFilename.includes("planialtimetrico") || normalizedFilename.includes("levantamento")) return "CADASTRO_TOPOGRAFIA";
  if (normalizedFilename.includes("urbanizacao") || normalizedFilename.includes("sinalizacao") || normalizedFilename.includes("pavimentacao")) return "URBANIZACAO_SINALIZACAO";

  // 3) Folder-path-based rules (fallback)
  const FOLDER_MAP: [string, string][] = [
    ["/md/", "MEMORIAL_OU_TR"],
    ["/dre/", "DRENAGEM"],
    ["/cat/", "CADASTRO_TOPOGRAFIA"],
    ["/urb_sin/", "URBANIZACAO_SINALIZACAO"],
    ["/urb/", "URBANIZACAO_SINALIZACAO"],
    ["/sin/", "URBANIZACAO_SINALIZACAO"],
    ["/orc/", "ORCAMENTO"],
    ["/cro/", "CRONOGRAMA"],
    ["/adm/", "ADMINISTRATIVO"],
  ];
  for (const [folder, category] of FOLDER_MAP) {
    if (normalizedPath.includes(folder)) return category;
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
      .from("processos").select("*").eq("id", processo_id).single();
    if (procErr) throw procErr;

    const { data: arquivos, error: arqErr } = await supabase
      .from("arquivos").select("*").eq("processo_id", processo_id);
    if (arqErr) throw arqErr;

    // Classify each file
    const classifiedFiles: { nome: string; categoria: string }[] = [];
    for (const arq of arquivos) {
      const categoria = classifyDocument(arq.nome_original);
      await supabase.from("arquivos").update({ categoria }).eq("id", arq.id);
      classifiedFiles.push({ nome: arq.nome_original, categoria });
    }

    const presentCategories = [...new Set(classifiedFiles.map((f) => f.categoria))];

    // ── Object extraction: prioritize TR > ORC > Cronograma > process name ──
    const disciplineMap: Record<string, string> = {
      DRENAGEM: "drenagem",
      URBANIZACAO_SINALIZACAO: "urbanização e sinalização",
      CADASTRO_TOPOGRAFIA: "cadastro e topografia",
      MEMORIAL_OU_TR: "memorial descritivo",
      TERMO_DE_REFERENCIA: "termo de referência",
    };

    const disciplinesForObject = presentCategories
      .filter((c) => !["ORCAMENTO", "ADMINISTRATIVO", "OUTROS", "RESPONSABILIDADE_TECNICA", "CRONOGRAMA", "COTACAO_OU_PROPOSTA", "MODELO"].includes(c))
      .map((c) => disciplineMap[c])
      .filter(Boolean);

    // Determine strongest source for object
    const hasTR = presentCategories.includes("TERMO_DE_REFERENCIA");
    const hasORC = presentCategories.includes("ORCAMENTO");
    const hasCrono = presentCategories.includes("CRONOGRAMA");

    let fontePrincipal = "nome do processo";
    if (hasTR) fontePrincipal = "termo de referência identificado no conjunto documental";
    else if (hasORC) fontePrincipal = "orçamento identificado no conjunto documental";
    else if (hasCrono) fontePrincipal = "cronograma identificado no conjunto documental";

    const prompt = `Você é um analista técnico. Com base nas informações abaixo, gere APENAS o objeto da contratação.

NOME DO PROCESSO: ${processo.nome_processo}
FONTE PRINCIPAL PARA O OBJETO: ${fontePrincipal}
DISCIPLINAS IDENTIFICADAS NOS DOCUMENTOS: ${disciplinesForObject.join(", ") || "não identificadas"}

REGRAS:
- O objeto deve descrever a OBRA ou INTERVENÇÃO, não os documentos
- NÃO mencione "execução de serviços de orçamento", "memorial descritivo" ou "termo de referência"
- Identifique o local/logradouro a partir do nome do processo, MAS apenas se for claro e não redundante
- EVITE repetições: NÃO repita a mesma palavra ou conceito (ex: "praia da Praia" é ERRADO)
- Se o nome do processo já contém o tipo de serviço, não repita. Ex: "Alimentação Artificial de Praia - Praia X" → "Execução de serviços de alimentação artificial de praia na Praia X."
- Se não houver local confiável, use apenas: "Execução de serviços de [descrição da intervenção]."
- Formato: "Execução de serviços de [obras/disciplinas técnicas] no/na/do/da [local, se identificado]."
- Seja conciso e técnico. Máximo 2 linhas.

Responda APENAS com o texto do objeto, sem aspas, sem explicações.`;

    let objetoTexto = "";
    try {
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (aiResponse.ok) {
        const aiResult = await aiResponse.json();
        objetoTexto = aiResult.choices?.[0]?.message?.content?.trim() || "";
      }
    } catch (aiErr) {
      console.error("AI error:", aiErr);
    }

    // Fallback
    if (!objetoTexto) {
      const obras = disciplinesForObject.length > 0
        ? disciplinesForObject.join(", ")
        : "obras";
      objetoTexto = `Execução de serviços de ${obras} – ${processo.nome_processo}.`;
    }

    // ── Build extracted data ──
    await supabase.from("dados_extraidos").delete().eq("processo_id", processo_id);

    // Determine if ART/RRT was truly identified
    const hasArtRrt = presentCategories.includes("RESPONSABILIDADE_TECNICA");

    const basicData = [
      { campo: "objeto_contratacao", valor: objetoTexto, origem_documento: `Inferido a partir de: ${fontePrincipal}`, confianca: hasTR ? "alta" : "media" },
      { campo: "numero_processo", valor: processo.numero_processo, origem_documento: "Cadastro do processo", confianca: "alta" },
      { campo: "orgao_responsavel", valor: processo.orgao, origem_documento: "Cadastro do processo", confianca: "alta" },
      { campo: "secretaria_responsavel", valor: processo.secretaria, origem_documento: "Cadastro do processo", confianca: "alta" },
      { campo: "valor_estimado", valor: "Não foi identificada informação correspondente nos documentos analisados.", origem_documento: null, confianca: "baixa" },
    ];

    // Only mention responsabilidade_tecnica if truly found
    if (hasArtRrt) {
      const artFiles = classifiedFiles.filter((f) => f.categoria === "RESPONSABILIDADE_TECNICA").map((f) => f.nome.split("/").pop()).join(", ");
      basicData.push({ campo: "responsavel_tecnico", valor: `Identificado(s): ${artFiles}`, origem_documento: "Documento(s) de ART/RRT classificado(s)", confianca: "media" });
    }

    for (const item of basicData) {
      await supabase.from("dados_extraidos").insert({
        processo_id,
        campo: item.campo,
        valor: item.valor,
        origem_documento: item.origem_documento,
        confianca: item.confianca,
      });
    }

    await supabase.from("processos").update({ status: "revisao" }).eq("id", processo_id);

    return new Response(
      JSON.stringify({
        success: true,
        extracted: basicData.length,
        filesProcessed: arquivos.length,
        classifications: classifiedFiles,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);

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
