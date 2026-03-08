import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { generateParecerDocx } from "@/lib/generate-docx";
import {
  Pencil, Check, X, Eye, EyeOff, FileText, Loader2, ArrowLeft, Download, Plus,
} from "lucide-react";

interface SecaoParecer {
  key: string;
  titulo: string;
  texto: string;
  origem?: string;
  confianca?: string;
  oculto: boolean;
}

const ValidacaoParecer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [secoes, setSecoes] = useState<SecaoParecer[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [initialized, setInitialized] = useState(false);

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
    queryKey: ["dados_extraidos_visible", id],
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

  const { data: pareceres } = useQuery({
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

  const campoLabels: Record<string, string> = {
    objeto_contratacao: "Objeto da Contratação",
    numero_processo: "Número do Processo",
    orgao_responsavel: "Órgão Responsável",
    secretaria_responsavel: "Secretaria Responsável",
    valor_estimado: "Valor Estimado",
    responsavel_tecnico: "Responsável Técnico",
  };

  // Build sections from extracted data once loaded
  useEffect(() => {
    if (initialized || !processo || !dadosExtraidos || !arquivos) return;

    const dadosMap: Record<string, { valor: string; origem?: string; confianca?: string }> = {};
    dadosExtraidos.forEach((d) => {
      dadosMap[d.campo] = {
        valor: d.valor,
        origem: d.origem_documento ?? undefined,
        confianca: d.confianca ?? undefined,
      };
    });

    const docsList = arquivos
      .map((a, i) => `${i + 1}. ${a.nome_original} [${a.categoria || "OUTROS"}]`)
      .join("\n");

    const built: SecaoParecer[] = [
      {
        key: "identificacao_processo",
        titulo: "2. IDENTIFICAÇÃO DO PROCESSO",
        texto: `Nome: ${processo.nome_processo}\nNúmero do Processo: ${processo.numero_processo}\nÓrgão: ${processo.orgao}\nSecretaria: ${processo.secretaria}`,
        oculto: false,
      },
      {
        key: "objeto",
        titulo: "3. OBJETO",
        texto: dadosMap["objeto_contratacao"]?.valor || "Não foi identificada informação correspondente nos documentos analisados.",
        origem: dadosMap["objeto_contratacao"]?.origem,
        confianca: dadosMap["objeto_contratacao"]?.confianca,
        oculto: false,
      },
      {
        key: "documentos_analisados",
        titulo: "4. DOCUMENTOS ANALISADOS",
        texto: docsList || "Nenhum documento analisado.",
        oculto: false,
      },
      {
        key: "valor_estimado",
        titulo: "5.1 VALOR ESTIMADO",
        texto: dadosMap["valor_estimado"]?.valor || "Não foi identificada informação correspondente nos documentos analisados.",
        origem: dadosMap["valor_estimado"]?.origem,
        confianca: dadosMap["valor_estimado"]?.confianca,
        oculto: false,
      },
      {
        key: "responsavel_tecnico_dado",
        titulo: "5.2 RESPONSÁVEL TÉCNICO",
        texto: dadosMap["responsavel_tecnico"]?.valor || "Não foi identificada informação correspondente nos documentos analisados.",
        origem: dadosMap["responsavel_tecnico"]?.origem,
        confianca: dadosMap["responsavel_tecnico"]?.confianca,
        oculto: false,
      },
      // Other extracted fields
      ...dadosExtraidos
        .filter((d) => !["objeto_contratacao", "valor_estimado", "responsavel_tecnico", "numero_processo", "orgao_responsavel", "secretaria_responsavel"].includes(d.campo))
        .map((d) => ({
          key: `extra_${d.id}`,
          titulo: `5.X ${campoLabels[d.campo] || d.campo}`,
          texto: d.valor,
          origem: d.origem_documento ?? undefined,
          confianca: d.confianca ?? undefined,
          oculto: false,
        })),
      {
        key: "inconsistencias",
        titulo: "6. REGISTRO DE INCONSISTÊNCIAS GRAVES",
        texto: "Não foram identificadas inconsistências graves nos documentos analisados.",
        oculto: false,
      },
      {
        key: "complementacao",
        titulo: "7. SOLICITAÇÃO DE COMPLEMENTAÇÃO DOCUMENTAL",
        texto: "Não há solicitação de complementação documental.",
        oculto: false,
      },
      {
        key: "sintese",
        titulo: "8. SÍNTESE DA ANÁLISE",
        texto: `Parecer técnico elaborado com base na análise de ${arquivos.length} documento(s) integrante(s) do processo administrativo nº ${processo.numero_processo}.`,
        oculto: false,
      },
      {
        key: "responsavel_tecnico_final",
        titulo: "9. IDENTIFICAÇÃO DO RESPONSÁVEL TÉCNICO",
        texto: dadosMap["responsavel_tecnico"]?.valor || "Não foi identificada informação correspondente nos documentos analisados.",
        oculto: false,
      },
    ];

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
      if (!processo || !arquivos) throw new Error("Dados não carregados");

      const nextVersion = (pareceres?.[0]?.versao ?? 0) + 1;
      const visibleSections = secoes.filter((s) => !s.oculto);

      const getSecao = (key: string) =>
        visibleSections.find((s) => s.key === key)?.texto || "";

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
          texto_validado: getSecao("identificacao_processo"),
        },
        objeto: getSecao("objeto") || "Não foi identificada informação correspondente nos documentos analisados.",
        documentos_analisados: arquivos.map((a) => ({
          nome: a.nome_original,
          categoria: a.categoria || "OUTROS",
        })),
        analise_tecnica: visibleSections
          .filter((s) => s.key.startsWith("valor_estimado") || s.key.startsWith("responsavel_tecnico_dado") || s.key.startsWith("extra_"))
          .map((s) => ({
            campo: s.titulo.replace(/^5\.\d?\s*/, "").replace(/^5\.X\s*/, ""),
            valor: s.texto,
            origem: s.origem,
            confianca: s.confianca,
          })),
        inconsistencias: getSecao("inconsistencias") || "Não foram identificadas inconsistências graves nos documentos analisados.",
        complementacao: getSecao("complementacao") || null,
        sintese: getSecao("sintese") || "—",
        responsavel_tecnico: getSecao("responsavel_tecnico_final") || "Não foi identificada informação correspondente nos documentos analisados.",
      };

      const { error } = await supabase.from("pareceres").insert({
        processo_id: id!,
        versao: nextVersion,
        conteudo_json: conteudo,
      });
      if (error) throw error;

      await supabase.from("processos").update({ status: "concluido" as const }).eq("id", id!);

      return { conteudo, version: nextVersion };
    },
    onSuccess: async (result) => {
      toast.success("Parecer técnico gerado com sucesso!");
      const version = String(result.version).padStart(2, "0");
      await generateParecerDocx(result.conteudo, `PARECER_TECNICO_V${version}.docx`);
      queryClient.invalidateQueries({ queryKey: ["pareceres", id] });
      queryClient.invalidateQueries({ queryKey: ["processo", id] });
      navigate(`/resultado/${id}`);
    },
    onError: (err) => {
      toast.error(`Erro ao gerar parecer: ${err.message}`);
    },
  });

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
            <CardTitle className="text-lg">Processo: {processo.nome_processo}</CardTitle>
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
