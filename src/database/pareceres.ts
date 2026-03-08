import { supabase } from "@/integrations/supabase/client";

export async function fetchPareceres(processoId: string) {
  const { data, error } = await supabase
    .from("pareceres")
    .select("*")
    .eq("processo_id", processoId)
    .order("versao", { ascending: false });
  if (error) throw error;
  return data;
}

export async function insertParecer(data: {
  processo_id: string;
  versao: number;
  conteudo_json: any;
}) {
  const { error } = await supabase.from("pareceres").insert(data);
  if (error) throw error;
}

export async function deleteParecer(parecerId: string) {
  const { error } = await supabase.from("pareceres").delete().eq("id", parecerId);
  if (error) throw error;
}
