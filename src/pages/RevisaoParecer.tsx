import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileText, Eye, EyeOff, Pencil, Check, X, Loader2, RefreshCw, ArrowRight,
} from "lucide-react";

const campoLabels: Record<string, string> = {
  objeto_contratacao: "Objeto da Contratação",
  numero_processo: "Número do Processo",
  orgao_responsavel: "Órgão Responsável",
  secretaria_responsavel: "Secretaria Responsável",
  valor_estimado: "Valor Estimado",
  responsavel_tecnico: "Responsável Técnico",
};

const confiancaColor: Record<string, string> = {
  alta: "bg-success text-success-foreground",
  media: "bg-warning text-warning-foreground",
  baixa: "bg-destructive text-destructive-foreground",
};

const RevisaoParecer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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

  const { data: dadosExtraidos, isLoading: loadingDados } = useQuery({
    queryKey: ["dados_extraidos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dados_extraidos")
        .select("*")
        .eq("processo_id", id!);
      if (error) throw error;
      return data;
    },
    refetchInterval: processo?.status === "analisando" ? 3000 : false,
  });

  const updateDado = useMutation({
    mutationFn: async ({ dadoId, updates }: { dadoId: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("dados_extraidos")
        .update(updates)
        .eq("id", dadoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dados_extraidos", id] });
    },
  });

  const reanalyze = useMutation({
    mutationFn: async () => {
      await supabase.from("processos").update({ status: "analisando" as const }).eq("id", id!);
      const { error } = await supabase.functions.invoke("analyze-documents", {
        body: { processo_id: id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reanálise iniciada");
      queryClient.invalidateQueries({ queryKey: ["processo", id] });
      queryClient.invalidateQueries({ queryKey: ["dados_extraidos", id] });
    },
  });

  const handleSaveEdit = (dadoId: string) => {
    updateDado.mutate({ dadoId, updates: { valor: editValue, editado: true } });
    setEditingId(null);
  };

  const toggleOculto = (dadoId: string, currentOculto: boolean) => {
    updateDado.mutate({ dadoId, updates: { oculto: !currentOculto } });
  };

  const isAnalyzing = processo?.status === "analisando";

  return (
    <AppLayout title="Revisão do Parecer Técnico">
      {processo && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Identificação do Processo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-muted-foreground">Processo:</span>
                <p className="font-medium">{processo.nome_processo}</p>
              </div>
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

      {arquivos && arquivos.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Documentos Analisados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {arquivos.map((arq) => (
                <div
                  key={arq.id}
                  className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="truncate">{arq.nome_original}</span>
                  {arq.categoria && (
                    <Badge variant="outline" className="ml-auto shrink-0 text-xs">
                      {arq.categoria}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Análise Técnica — Dados Extraídos</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => reanalyze.mutate()}
                disabled={isAnalyzing}
              >
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
                Reanalisar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isAnalyzing && (!dadosExtraidos || dadosExtraidos.length === 0) ? (
            <div className="flex flex-col items-center py-12">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Analisando documentos...</p>
            </div>
          ) : dadosExtraidos && dadosExtraidos.length > 0 ? (
            <div className="space-y-3">
              {dadosExtraidos.map((dado) => (
                <div
                  key={dado.id}
                  className={`rounded-lg border p-4 transition-opacity ${
                    dado.oculto ? "opacity-40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {campoLabels[dado.campo] || dado.campo}
                        </span>
                        <span
                          className={`status-badge text-[10px] ${
                            confiancaColor[dado.confianca || "media"]
                          }`}
                        >
                          {dado.confianca}
                        </span>
                        {dado.editado && (
                          <Badge variant="secondary" className="text-[10px]">
                            editado
                          </Badge>
                        )}
                      </div>
                      {editingId === dado.id ? (
                        <div className="flex gap-2">
                          <Textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="min-h-[60px] text-sm"
                          />
                          <div className="flex flex-col gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => handleSaveEdit(dado.id)}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-foreground">{dado.valor}</p>
                      )}
                      {dado.origem_documento && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Origem: {dado.origem_documento}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingId(dado.id);
                          setEditValue(dado.valor);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => toggleOculto(dado.id, dado.oculto ?? false)}
                      >
                        {dado.oculto ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum dado extraído ainda. Clique em "Reanalisar" para processar os documentos.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={() => navigate(`/validacao/${id}`)}
          disabled={!dadosExtraidos || dadosExtraidos.length === 0}
        >
          Validar e Montar Parecer
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </AppLayout>
  );
};

export default RevisaoParecer;
