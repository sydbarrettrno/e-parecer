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

// ── HIGH-PRIORITY filename rules (checked BEFORE folder rules) ──
const HIGH_PRIORITY_FILENAME_RULES: [string, string][] = [
  ["cronograma", "CRONOGRAMA"],
  ["art", "RESPONSABILIDADE_TECNICA"],
  ["rrt", "RESPONSABILIDADE_TECNICA"],
];

// ── Folder-path-based rules ──
const FOLDER_CATEGORY_MAP: Record<string, string> = {
  "/md/": "MEMORIAL_OU_TR",
  "/dre/": "DRENAGEM",
  "/cat/": "CADASTRO_TOPOGRAFIA",
  "/urb_sin/": "URBANIZACAO_SINALIZACAO",
  "/urb/": "URBANIZACAO_SINALIZACAO",
  "/sin/": "URBANIZACAO_SINALIZACAO",
  "/orc/": "ORCAMENTO",
  "/cro/": "CRONOGRAMA",
  "/adm/": "ADMINISTRATIVO",
};

// ── Standard filename keyword rules ──
const FILENAME_RULES: [string, string][] = [
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
];

function classifyDocument(filename: string): string {
  const normalizedPath = normalize(filename);
  const normalizedFilename = normalize(filename.split("/").pop() || filename);

  for (const [pattern, category] of HIGH_PRIORITY_FILENAME_RULES) {
    if (normalizedFilename.includes(pattern)) return category;
  }

  for (const [folder, category] of Object.entries(FOLDER_CATEGORY_MAP)) {
    if (normalizedPath.includes(folder)) return category;
  }

  for (const [pattern, category] of FILENAME_RULES) {
    if (normalizedFilename.includes(pattern)) return category;
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

    // Build discipline list for object description
    const disciplineMap: Record<string, string> = {
      DRENAGEM: "drenagem",
      URBANIZACAO_SINALIZACAO: "urbanização e sinalização",
      CADASTRO_TOPOGRAFIA: "cadastro e topografia",
      MEMORIAL_OU_TR: "memorial descritivo",
      ORCAMENTO: "orçamento",
      CRONOGRAMA: "cronograma",
      RESPONSABILIDADE_TECNICA: "responsabilidade técnica",
      ADMINISTRATIVO: "documentos administrativos",
    };
    const presentCategories = [...new Set(classifiedFiles.map((f) => f.categoria))];

    // Simple AI prompt: only object description, no complex analysis
    const disciplinesForObject = presentCategories
      .filter((c) => !["ORCAMENTO", "ADMINISTRATIVO", "OUTROS", "RESPONSABILIDADE_TECNICA", "CRONOGRAMA"].includes(c))
      .map((c) => disciplineMap[c])
      .filter(Boolean);

    const prompt = `Você é um analista técnico. Com base nas informações abaixo, gere APENAS o objeto da contratação.

NOME DO PROCESSO: ${processo.nome_processo}
DISCIPLINAS IDENTIFICADAS NOS DOCUMENTOS: ${disciplinesForObject.join(", ") || "não identificadas"}

REGRAS:
- O objeto deve descrever a OBRA ou INTERVENÇÃO, não os documentos
- NÃO mencione "execução de serviços de orçamento" ou "memorial descritivo"
- Identifique o local/logradouro a partir do nome do processo
- Formato: "Execução de serviços de [obras/disciplinas técnicas] da/do [local]."
- Exemplo: "Execução de serviços de pavimentação, drenagem, urbanização e sinalização da Rua Angelina das Dores."

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

    // Clear old extracted data & insert basic fields
    await supabase.from("dados_extraidos").delete().eq("processo_id", processo_id);

    const basicData = [
      { campo: "objeto_contratacao", valor: objetoTexto, origem_documento: "Inferido do nome do processo e documentos classificados", confianca: "media" },
      { campo: "numero_processo", valor: processo.numero_processo, origem_documento: "Cadastro do processo", confianca: "alta" },
      { campo: "orgao_responsavel", valor: processo.orgao, origem_documento: "Cadastro do processo", confianca: "alta" },
      { campo: "secretaria_responsavel", valor: processo.secretaria, origem_documento: "Cadastro do processo", confianca: "alta" },
      { campo: "valor_estimado", valor: "Não foi identificada informação correspondente nos documentos analisados.", origem_documento: null, confianca: "baixa" },
    ];

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
