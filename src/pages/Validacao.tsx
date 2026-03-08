import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Pencil, Check, X, Eye, EyeOff, FileText, Loader2, ArrowLeft, Download,
} from "lucide-react";
import { fetchProcesso, updateProcessoTitle } from "@/database/processos";
import { fetchArquivos } from "@/database/arquivos";
import { fetchDadosExtraidos } from "@/database/dados-extraidos";
import { fetchPareceres } from "@/database/pareceres";
import { buildSecoesFromData, type SecaoParecer } from "@/services/objectExtractor";
import { executePipelineFinalizacao } from "@/services/pipeline";

const ValidacaoParecer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [secoes, setSecoes] = useState<SecaoParecer[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");

  const { data: processo } = useQuery({
    queryKey: ["processo", id],
    queryFn: () => fetchProcesso(id!),
  });

  const { data: dadosExtraidos } = useQuery({
    queryKey: ["dados_extraidos_visible", id],
    queryFn: () => fetchDadosExtraidos(id!, true),
  });

  const { data: arquivos } = useQuery({
    queryKey: ["arquivos", id],
    queryFn: () => fetchArquivos(id!),
  });

  const { data: pareceres } = useQuery({
    queryKey: ["pareceres", id],
    queryFn: () => fetchPareceres(id!),
  });

  // Build sections from extracted data once loaded
  useEffect(() => {
    if (initialized || !processo || !dadosExtraidos || !arquivos) return;
    const built = buildSecoesFromData(processo, dadosExtraidos, arquivos);
    setSecoes(built);
    setInitialized(true);
  }, [processo, dadosExtraidos, arquivos, initialized]);

  const handleEdit = (key: string, texto: string) => {
    setEditingKey(key);
    setEditValue(texto);
  };

  const handleSaveEdit = (key: string) => {
    setSecoes((prev) =>
      prev.map((s) => (s.key === key ? { ...s, texto: editValue } : s))
    );
    setEditingKey(null);
  };

  const toggleOculto = (key: string) => {
    setSecoes((prev) =>
      prev.map((s) => (s.key === key ? { ...s, oculto: !s.oculto } : s))
    );
  };

  const confiancaColor: Record<string, string> = {
    alta: "bg-success text-success-foreground",
    media: "bg-warning text-warning-foreground",
    baixa: "bg-destructive text-destructive-foreground",
  };

  const gerarParecer = useMutation({
    mutationFn: async () => {
      if (!processo) throw new Error("Dados não carregados");
      return executePipelineFinalizacao({
        processoId: id!,
        processo: {
          nome_processo: processo.nome_processo,
          numero_processo: processo.numero_processo,
          orgao: processo.orgao,
          secretaria: processo.secretaria,
        },
        secoes,
      });
    },
    onSuccess: () => {
      toast.success("Parecer técnico gerado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["pareceres", id] });
      queryClient.invalidateQueries({ queryKey: ["processo", id] });
      navigate(`/resultado/${id}`);
    },
    onError: (err) => {
      toast.error(`Erro ao gerar parecer: ${err.message}`);
    },
  });

  const handleSaveTitle = async () => {
    await updateProcessoTitle(id!, titleValue);
    queryClient.invalidateQueries({ queryKey: ["processo", id] });
    setEditingTitle(false);
    toast.success("Título atualizado!");
  };

  return (
    <AppLayout title="Validação do Parecer Técnico">
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/revisao/${id}`)}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar à Revisão
        </Button>
      </div>

      {processo && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              {editingTitle ? (
                <>
                  <Input
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    className="h-8 text-lg font-semibold"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") setEditingTitle(false);
                    }}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveTitle}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingTitle(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <CardTitle className="text-lg">Processo: {processo.nome_processo}</CardTitle>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setTitleValue(processo.nome_processo); setEditingTitle(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
              <div>
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="outline" className="mt-1">
                  {processo.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm text-foreground">
          <strong>Etapa de Validação:</strong> Revise cada seção do parecer técnico abaixo.
          Você pode editar o texto, ocultar seções ou complementar informações faltantes.
          A geração do documento final só ocorrerá após sua confirmação.
        </p>
      </div>

      {!initialized ? (
        <div className="flex flex-col items-center py-12">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando seções do parecer...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {secoes.map((secao) => (
            <Card
              key={secao.key}
              className={`transition-opacity ${secao.oculto ? "opacity-40" : ""}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{secao.titulo}</CardTitle>
                    {secao.confianca && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          confiancaColor[secao.confianca] || "bg-muted text-muted-foreground"
                        }`}
                      >
                        {secao.confianca}
                      </span>
                    )}
                    {secao.oculto && (
                      <Badge variant="secondary" className="text-[10px]">
                        oculto
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleEdit(secao.key, secao.texto)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => toggleOculto(secao.key)}
                    >
                      {secao.oculto ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {secao.origem && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    <FileText className="mr-1 inline h-3 w-3" />
                    Origem: {secao.origem}
                  </p>
                )}

                {editingKey === secao.key ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="min-h-[100px] text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(secao.key)}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Salvar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingKey(null)}
                      >
                        <X className="mr-1 h-3.5 w-3.5" />
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-line text-sm text-foreground">
                    {secao.texto}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between border-t pt-6">
        <Button variant="outline" onClick={() => navigate(`/revisao/${id}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar à Revisão
        </Button>
        <Button
          size="lg"
          onClick={() => gerarParecer.mutate()}
          disabled={gerarParecer.isPending || !initialized}
        >
          {gerarParecer.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Confirmar e Gerar Parecer Técnico
        </Button>
      </div>
    </AppLayout>
  );
};

export default ValidacaoParecer;
