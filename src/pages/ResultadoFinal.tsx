import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, FileText, Loader2, Plus, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { generateParecerDocx } from "@/services/docxGenerator";

const ResultadoFinal = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: processo } = useQuery({
    queryKey: ["processo", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processos")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: dadosExtraidos } = useQuery({
    queryKey: ["dados_extraidos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dados_extraidos")
        .select("*")
        .eq("processo_id", id!)
        .eq("oculto", false);
      if (error) throw error;
      return data;
    },
  });

  const { data: arquivos } = useQuery({
    queryKey: ["arquivos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arquivos")
        .select("*")
        .eq("processo_id", id!);
      if (error) throw error;
      return data;
    },
  });

  const { data: pareceres, isLoading: loadingPareceres } = useQuery({
    queryKey: ["pareceres", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pareceres")
        .select("*")
        .eq("processo_id", id!)
        .order("versao", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const gerarParecer = useMutation({
    mutationFn: async () => {
      if (!processo || !dadosExtraidos || !arquivos) throw new Error("Dados não carregados");

      const nextVersion = (pareceres?.[0]?.versao ?? 0) + 1;
      const dadosMap: Record<string, string> = {};
      dadosExtraidos.forEach((d) => {
        dadosMap[d.campo] = d.valor;
      });

      const conteudo = {
        identificacao_parecer: {
          numero: `PT-${processo.numero_processo}-V${String(nextVersion).padStart(2, "0")}`,
          data: format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
        },
        identificacao_processo: {
          nome: processo.nome_processo,
          numero: processo.numero_processo,
          orgao: processo.orgao,
          secretaria: processo.secretaria,
        },
        objeto: dadosMap["objeto_contratacao"] || "Não foi identificada informação correspondente nos documentos analisados.",
        documentos_analisados: arquivos.map((a) => ({
          nome: a.nome_original,
          categoria: a.categoria || "OUTROS",
        })),
        analise_tecnica: dadosExtraidos.map((d) => ({
          campo: d.campo,
          valor: d.valor,
          origem: d.origem_documento,
          confianca: d.confianca,
        })),
        inconsistencias: "Não foram identificadas inconsistências graves nos documentos analisados.",
        complementacao: null,
        sintese: `Parecer técnico elaborado com base na análise de ${arquivos.length} documento(s) integrante(s) do processo administrativo nº ${processo.numero_processo}.`,
        responsavel_tecnico: dadosMap["responsavel_tecnico"] || "Não foi identificada informação correspondente nos documentos analisados.",
      };

      // Save to DB
      const { error } = await supabase.from("pareceres").insert({
        processo_id: id!,
        versao: nextVersion,
        conteudo_json: conteudo,
      });
      if (error) throw error;

      // Update process status
      await supabase.from("processos").update({ status: "concluido" as const }).eq("id", id!);

      return { conteudo, version: nextVersion };
    },
    onSuccess: () => {
      toast.success("Parecer técnico gerado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["pareceres", id] });
      queryClient.invalidateQueries({ queryKey: ["processo", id] });
    },
    onError: (err) => {
      toast.error(`Erro ao gerar parecer: ${err.message}`);
    },
  });

  const handleDownload = async (parecer: any) => {
    try {
      const version = String(parecer.versao).padStart(2, "0");
      await generateParecerDocx(parecer.conteudo_json, `PARECER_TECNICO_V${version}.docx`);
      toast.success("Download iniciado!");
    } catch (err: any) {
      toast.error(`Erro no download: ${err.message}`);
    }
  };

  return (
    <AppLayout title="Resultado Final">
      {processo && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Processo: {processo.nome_processo}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <span className="text-muted-foreground">Número:</span>
                <p className="font-medium">{processo.numero_processo}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Órgão:</span>
                <p className="font-medium">{processo.orgao}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Secretaria:</span>
                <p className="font-medium">{processo.secretaria}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 flex gap-3">
        <Button onClick={() => gerarParecer.mutate()} disabled={gerarParecer.isPending}>
          {gerarParecer.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : pareceres && pareceres.length > 0 ? (
            <Plus className="mr-2 h-4 w-4" />
          ) : (
            <FileText className="mr-2 h-4 w-4" />
          )}
          {pareceres && pareceres.length > 0 ? "Gerar Nova Versão" : "Gerar Parecer Técnico"}
        </Button>
      </div>

      {loadingPareceres ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : pareceres && pareceres.length > 0 ? (
        <div className="space-y-4">
          {pareceres.map((parecer) => (
            <Card key={parecer.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">
                      PARECER_TECNICO_V{String(parecer.versao).padStart(2, "0")}.docx
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Gerado em{" "}
                      {format(new Date(parecer.data_execucao), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => handleDownload(parecer)}>
                  <Download className="mr-2 h-4 w-4" />
                  Baixar DOCX
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <FileText className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum parecer gerado ainda. Clique no botão acima para gerar.
            </p>
          </CardContent>
        </Card>
      )}
    </AppLayout>
  );
};

export default ResultadoFinal;
