import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, FileText, Clock, CheckCircle, AlertCircle, Search, MoreVertical, Pencil, Eye, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusConfig: Record<string, { label: string; class: string; icon: typeof Clock }> = {
  cadastrado: { label: "Cadastrado", class: "status-cadastrado", icon: Clock },
  analisando: { label: "Analisando", class: "status-analisando", icon: Search },
  revisao: { label: "Em Revisão", class: "status-revisao", icon: AlertCircle },
  concluido: { label: "Concluído", class: "status-concluido", icon: CheckCircle },
  erro: { label: "Erro", class: "status-erro", icon: AlertCircle },
};

const Dashboard = () => {
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
              <Link key={processo.id} to={linkPath}>
                <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base leading-tight">
                        {processo.nome_processo}
                      </CardTitle>
                      <span className={`status-badge ${status.class}`}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {status.label}
                      </span>
                    </div>
                  </CardHeader>
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
                </Card>
              </Link>
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
    </AppLayout>
  );
};

export default Dashboard;
