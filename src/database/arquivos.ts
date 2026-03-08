import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type CategoriaDocumento = Database["public"]["Enums"]["categoria_documento"];

export async function fetchArquivos(processoId: string) {
  const { data, error } = await supabase
    .from("arquivos")
    .select("*")
    .eq("processo_id", processoId);
  if (error) throw error;
  return data;
}

export async function insertArquivo(data: {
  processo_id: string;
  nome_original: string;
  extensao: string;
  storage_path: string;
  categoria?: CategoriaDocumento;
}) {
  const { error } = await supabase.from("arquivos").insert(data);
  if (error) throw error;
}
