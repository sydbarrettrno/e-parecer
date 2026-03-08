import type { Database } from "@/integrations/supabase/types";

export type CategoriaDocumento = Database["public"]["Enums"]["categoria_documento"];

const CATEGORY_KEYWORDS: Record<CategoriaDocumento, string[]> = {
  ADMINISTRATIVO: ["oficio", "despacho", "portaria", "memorando", "decreto", "edital", "ata", "certidao", "declaracao"],
  MEMORIAL_OU_TR: ["memorial", "termo de referencia", "tr", "especificacao", "descritivo", "projeto basico"],
  ORCAMENTO: ["orcamento", "planilha", "bdi", "composicao", "sinapi", "custo", "preco"],
  CRONOGRAMA: ["cronograma", "prazo", "etapa", "fisico-financeiro", "gantt"],
  RESPONSABILIDADE_TECNICA: ["art", "rrt", "crea", "cau", "responsavel tecnico", "engenheiro", "arquiteto"],
  OUTROS: [],
};

export function classifyDocument(filename: string): CategoriaDocumento {
  const lower = filename.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.length > 0 && keywords.some((kw) => lower.includes(kw))) return category as CategoriaDocumento;
  }
  return "OUTROS";
}
