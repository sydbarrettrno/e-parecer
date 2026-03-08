import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  ADMINISTRATIVO: ["oficio", "despacho", "portaria", "memorando", "decreto", "edital", "ata", "certidao", "declaracao"],
  MEMORIAL_OU_TR: ["memorial", "termo de referencia", "tr", "especificacao", "descritivo", "projeto basico"],
  ORCAMENTO: ["orcamento", "planilha", "bdi", "composicao", "sinapi", "custo", "preco"],
  CRONOGRAMA: ["cronograma", "prazo", "etapa", "fisico-financeiro", "gantt"],
  RESPONSABILIDADE_TECNICA: ["art", "rrt", "crea", "cau", "responsavel tecnico", "engenheiro", "arquiteto"],
};

function classifyDocument(filename: string): string {
  const lower = filename.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return "OUTROS";
}

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

    // Get process info
    const { data: processo, error: procErr } = await supabase
      .from("processos")
      .select("*")
      .eq("id", processo_id)
      .single();
    if (procErr) throw procErr;

    // Get files
    const { data: arquivos, error: arqErr } = await supabase
      .from("arquivos")
      .select("*")
      .eq("processo_id", processo_id);
    if (arqErr) throw arqErr;

    // Classify documents
    for (const arq of arquivos) {
      const categoria = classifyDocument(arq.nome_original);
      await supabase
        .from("arquivos")
        .update({ categoria })
        .eq("id", arq.id);
    }

    // Build context for AI analysis
    const fileNames = arquivos.map((a: any) => `- ${a.nome_original} (${classifyDocument(a.nome_original)})`).join("\n");

    const prompt = `Você é um analista técnico de processos licitatórios de engenharia pública.

Analise as informações do processo abaixo e extraia os seguintes dados:
1. objeto_contratacao - O objeto da contratação
2. numero_processo - Número do processo administrativo
3. orgao_responsavel - Órgão responsável
4. secretaria_responsavel - Secretaria responsável
5. valor_estimado - Valor estimado da contratação
6. responsavel_tecnico - Responsável técnico (nome, registro profissional)

INFORMAÇÕES DO PROCESSO:
- Nome: ${processo.nome_processo}
- Número: ${processo.numero_processo}
- Órgão: ${processo.orgao}
- Secretaria: ${processo.secretaria}

DOCUMENTOS DISPONÍVEIS:
${fileNames}

INSTRUÇÕES:
- Para cada dado, retorne um JSON com os campos:
  - campo: identificador do campo (ex: "objeto_contratacao")
  - valor: o valor extraído
  - origem_documento: nome do documento de onde a informação foi extraída
  - trecho: o trecho exato ou resumido do documento que contém a informação
  - confianca: nível de confiança ("alta", "media", "baixa")
- Se a informação está presente nos dados do processo, use-a com confiança "alta" e indique "Cadastro do processo" como origem
- Para o trecho, cite a parte relevante do documento ou metadado que embasa a informação
- Se a informação não puder ser determinada, use "Não identificado" como valor, null como trecho, e confiança "baixa"
- Responda APENAS com um array JSON, sem markdown, sem explicações

Exemplo:
[{"campo":"objeto_contratacao","valor":"Reforma do prédio sede","origem_documento":"Termo de Referência","trecho":"O presente termo tem por objeto a contratação de empresa para reforma...","confianca":"alta"}]`;

    let extractedData: any[] = [];

    try {
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (aiResponse.ok) {
        const aiResult = await aiResponse.json();
        const content = aiResult.choices?.[0]?.message?.content || "";

        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          extractedData = JSON.parse(jsonMatch[0]);
        }
      } else {
        const errText = await aiResponse.text();
        console.error("AI gateway error:", aiResponse.status, errText);
      }
    } catch (aiErr) {
      console.error("AI analysis error:", aiErr);
    }

    // Fallback if AI failed
    if (extractedData.length === 0) {
      extractedData = [
        { campo: "objeto_contratacao", valor: processo.nome_processo, origem_documento: "Cadastro do processo", trecho: `Nome do processo: ${processo.nome_processo}`, confianca: "media" },
        { campo: "numero_processo", valor: processo.numero_processo, origem_documento: "Cadastro do processo", trecho: `Número: ${processo.numero_processo}`, confianca: "alta" },
        { campo: "orgao_responsavel", valor: processo.orgao, origem_documento: "Cadastro do processo", trecho: `Órgão: ${processo.orgao}`, confianca: "alta" },
        { campo: "secretaria_responsavel", valor: processo.secretaria, origem_documento: "Cadastro do processo", trecho: `Secretaria: ${processo.secretaria}`, confianca: "alta" },
        { campo: "valor_estimado", valor: "Não identificado", origem_documento: null, trecho: null, confianca: "baixa" },
        { campo: "responsavel_tecnico", valor: "Não identificado", origem_documento: null, trecho: null, confianca: "baixa" },
      ];
    }

    // Clear old extracted data
    await supabase.from("dados_extraidos").delete().eq("processo_id", processo_id);

    // Insert extracted data with trecho
    for (const item of extractedData) {
      await supabase.from("dados_extraidos").insert({
        processo_id,
        campo: item.campo,
        valor: item.valor,
        origem_documento: item.origem_documento || null,
        trecho: item.trecho || null,
        confianca: item.confianca || "media",
      });
    }

    // Update process status
    await supabase
      .from("processos")
      .update({ status: "revisao" })
      .eq("id", processo_id);

    return new Response(
      JSON.stringify({ success: true, extracted: extractedData.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
