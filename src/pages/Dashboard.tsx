import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, FileText, Clock, CheckCircle, AlertCircle, Search, MoreVertical, Pencil, Eye, RotateCcw, Check, X, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; class: string; icon: typeof Clock }> = {
  cadastrado: { label: "Cadastrado", class: "status-cadastrado", icon: Clock },
  analisando: { label: "Analisando", class: "status-analisando", icon: Search },
  revisao: { label: "Em Revisão", class: "status-revisao", icon: AlertCircle },
  concluido: { label: "Concluído", class: "status-concluido", icon: CheckCircle },
  erro: { label: "Erro", class: "status-erro", icon: AlertCircle },
};

const Dashboard = () => {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nome: string } | null>(null);

  const { data: processos, isLoading } = useQuery({
    queryKey: ["processos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateTitle = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase.from("processos").update({ nome_processo: nome }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Título atualizado!");
      queryClient.invalidateQueries({ queryKey: ["processos"] });
      setEditingId(null);
    },
    onError: () => toast.error("Erro ao atualizar título"),
  });

  const deleteProcesso = useMutation({
    mutationFn: async (processoId: string) => {
      // Check if there are pareceres
      const { data: pareceres, error: pErr } = await supabase
        .from("pareceres")
        .select("id")
        .eq("processo_id", processoId)
        .limit(1);
      if (pErr) throw pErr;
      if (pareceres && pareceres.length > 0) {
        throw new Error("Exclua todas as versões do parecer antes de excluir o processo.");
      }
      // Delete related data
      const { error: dErr } = await supabase.from("dados_extraidos").delete().eq("processo_id", processoId);
      if (dErr) throw dErr;
      const { error: aErr } = await supabase.from("arquivos").delete().eq("processo_id", processoId);
      if (aErr) throw aErr;
      const { error: err } = await supabase.from("processos").delete().eq("id", processoId);
      if (err) throw err;
    },
    onSuccess: () => {
      toast.success("Processo excluído com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["processos"] });
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setDeleteTarget(null);
    },
  });

  const startEditTitle = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  return (
    <AppLayout title="Painel de Processos">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-muted-foreground">
          {processos?.length ?? 0} processo(s) cadastrado(s)
        </p>
        <Link to="/novo">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Novo Parecer Técnico
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse-slow">
              <CardHeader className="pb-3">
                <div className="h-5 w-3/4 rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 w-1/2 rounded bg-muted" />
                  <div className="h-4 w-2/3 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : processos && processos.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {processos.map((processo) => {
            const status = statusConfig[processo.status] || statusConfig.cadastrado;
            const StatusIcon = status.icon;
            const linkPath = processo.status === "concluido"
              ? `/resultado/${processo.id}`
              : processo.status === "revisao"
                ? `/revisao/${processo.id}`
                : `/revisao/${processo.id}`;

            return (
              <Card key={processo.id} className="transition-all hover:shadow-md hover:border-primary/30">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    {editingId === processo.id ? (
                      <div className="flex flex-1 items-center gap-1">
                        <Input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="h-7 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") updateTitle.mutate({ id: processo.id, nome: editTitle });
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateTitle.mutate({ id: processo.id, nome: editTitle })}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Link to={linkPath} className="flex-1">
                        <CardTitle className="text-base leading-tight cursor-pointer hover:text-primary">
                          {processo.nome_processo}
                        </CardTitle>
                      </Link>
                    )}
                    <div className="flex items-center gap-2">
                      <span className={`status-badge ${status.class}`}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {status.label}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => startEditTitle(processo.id, processo.nome_processo)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Editar Título
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/revisao/${processo.id}`} className="flex items-center gap-2">
                              <Pencil className="h-3.5 w-3.5" />
                              Editar Dados Extraídos
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/validacao/${processo.id}`} className="flex items-center gap-2">
                              <Eye className="h-3.5 w-3.5" />
                              Validar Parecer
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/resultado/${processo.id}`} className="flex items-center gap-2">
                              <FileText className="h-3.5 w-3.5" />
                              Ver Resultado Final
                            </Link>
                          </DropdownMenuItem>
                          {processo.status === "concluido" && (
                            <DropdownMenuItem asChild>
                              <Link to={`/validacao/${processo.id}`} className="flex items-center gap-2">
                                <RotateCcw className="h-3.5 w-3.5" />
                                Gerar Nova Versão
                              </Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget({ id: processo.id, nome: processo.nome_processo })}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Excluir Processo
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <Link to={linkPath}>
                  <CardContent>
                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5" />
                        <span>Nº {processo.numero_processo}</span>
                      </div>
                      <div>{processo.orgao} — {processo.secretaria}</div>
                      <div className="text-xs">
                        {format(new Date(processo.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                      </div>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-lg font-semibold">Nenhum processo cadastrado</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Crie um novo parecer técnico para começar
            </p>
            <Link to="/novo">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Parecer Técnico
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir processo?</AlertDialogTitle>
            <AlertDialogDescription>
              O processo "{deleteTarget?.nome}" será excluído permanentemente junto com seus arquivos e dados extraídos. Se houver pareceres gerados, exclua-os primeiro na tela de Resultado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteProcesso.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Dashboard;
