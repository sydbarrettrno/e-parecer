import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Download, FileText, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { generateParecerDocx, generateParecerDocxLegacy, type DadosParecer } from "@/lib/generate-docx";

const ResultadoFinal = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [deleteVersionId, setDeleteVersionId] = useState<string | null>(null);

  const { data: processo } = useQuery({
    queryKey: ["processo", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processos").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: pareceres, isLoading: loadingPareceres } = useQuery({
    queryKey: ["pareceres", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pareceres").select("*").eq("processo_id", id!)
        .order("versao", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleDownload = async (parecer: any) => {
    try {
      const version = String(parecer.versao).padStart(2, "0");
      const conteudo = parecer.conteudo_json;

      // New format (has secoes array)
      if (conteudo?.secoes && Array.isArray(conteudo.secoes)) {
        const dados: DadosParecer = {
          numeroParecer: conteudo.identificacao_parecer?.numero || "",
          orgao: conteudo.identificacao_processo?.orgao || "",
          secretaria: conteudo.identificacao_processo?.secretaria || "",
          secoes: conteudo.secoes,
          assinatura: conteudo.assinatura || { local: "", data: "", nome: "", cargo: "", registro: "" },
        };
        await generateParecerDocx(dados, `PARECER_TECNICO_V${version}.docx`);
      } else {
        // Legacy format
        await generateParecerDocxLegacy(conteudo, `PARECER_TECNICO_V${version}.docx`);
      }
      toast.success("Download iniciado!");
    } catch (err: any) {
      toast.error(`Erro no download: ${err.message}`);
    }
  };

  const deleteVersion = useMutation({
    mutationFn: async (parecerId: string) => {
      const { error } = await supabase.from("pareceres").delete().eq("id", parecerId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Versão excluída com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["pareceres", id] });
      setDeleteVersionId(null);
    },
    onError: () => toast.error("Erro ao excluir versão"),
  });

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
                      {format(new Date(parecer.data_execucao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => handleDownload(parecer)}>
                    <Download className="mr-2 h-4 w-4" />
                    Baixar DOCX
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setDeleteVersionId(parecer.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <FileText className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum parecer gerado ainda.
            </p>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteVersionId} onOpenChange={() => setDeleteVersionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir versão do parecer?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O parecer será permanentemente excluído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteVersionId && deleteVersion.mutate(deleteVersionId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default ResultadoFinal;
