import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  generateParecerDocx,
  groupDocuments,
  type SecaoDocumento,
  type DadosParecer,
} from "@/lib/generate-docx";
import {
  Pencil, Check, X, Download, Loader2, ArrowLeft, ArrowUp, ArrowDown,
  Plus, Trash2, GripVertical, FileText,
} from "lucide-react";

const PreviaParecer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [secoes, setSecoes] = useState<SecaoDocumento[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editingTitleIdx, setEditingTitleIdx] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Signature fields
  const [assinatura, setAssinatura] = useState({
    local: "",
    data: "",
    nome: "",
    cargo: "",
    registro: "",
  });
  const [numeroParecer, setNumeroParecer] = useState("");

  const { data: processo } = useQuery({
    queryKey: ["processo", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processos").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: dadosExtraidos } = useQuery({
    queryKey: ["dados_extraidos_visible", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dados_extraidos").select("*").eq("processo_id", id!).eq("oculto", false);
      if (error) throw error;
      return data;
    },
  });

  const { data: arquivos } = useQuery({
    queryKey: ["arquivos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("arquivos").select("*").eq("processo_id", id!);
      if (error) throw error;
      return data;
    },
  });

  const { data: pareceres } = useQuery({
    queryKey: ["pareceres", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pareceres").select("*").eq("processo_id", id!)
        .order("versao", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Build sections from data
  useEffect(() => {
    if (initialized || !processo || !dadosExtraidos || !arquivos) return;

    const dadosMap: Record<string, string> = {};
    dadosExtraidos.forEach((d) => { dadosMap[d.campo] = d.valor; });

    const nextVersion = (pareceres?.[0]?.versao ?? 0) + 1;
    const numParecer = `Nº ${String(nextVersion).padStart(3, "0")}/${new Date().getFullYear()} – ${processo.secretaria}`;
    setNumeroParecer(numParecer);

    setAssinatura({
      local: processo.orgao,
      data: format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
      nome: dadosMap["responsavel_tecnico"] || "",
      cargo: "",
      registro: "",
    });

    // Group documents
    const docsGrouped = groupDocuments(
      arquivos.map((a) => ({ nome: a.nome_original, categoria: a.categoria || "OUTROS" }))
    );

    // Helper functions for file grouping
    const byCategory = (cat: string) => arquivos.filter((a) => a.categoria === cat);
    const listFileNames = (cat: string) => byCategory(cat).map((a) => a.nome_original.split("/").pop() || a.nome_original);

    // 5.1 Projetos
    const memoriais = listFileNames("MEMORIAL_OU_TR");
    const drenagem = listFileNames("DRENAGEM");
    const cadastro = listFileNames("CADASTRO_TOPOGRAFIA");
    const urbSin = listFileNames("URBANIZACAO_SINALIZACAO");
    const artRrt = listFileNames("RESPONSABILIDADE_TECNICA");
    const projetosLines: string[] = [];
    if (memoriais.length > 0) projetosLines.push(`Memorial descritivo / Termo de referência: ${memoriais.join(", ")}.`);
    if (drenagem.length > 0) projetosLines.push(`Projeto de drenagem: ${drenagem.join(", ")}.`);
    if (cadastro.length > 0) projetosLines.push(`Cadastro / Topografia: ${cadastro.join(", ")}.`);
    if (urbSin.length > 0) projetosLines.push(`Urbanização / Sinalização: ${urbSin.join(", ")}.`);
    if (artRrt.length > 0) projetosLines.push(`ART/RRT: ${artRrt.join(", ")}.`);
    const projetosTexto = projetosLines.length > 0
      ? `Foram identificados os seguintes documentos técnicos:\n${projetosLines.join("\n")}`
      : "Não foram identificados projetos ou documentos técnicos.";

    // 5.2 Valor
    const valorTexto = dadosMap["valor_estimado"] || "Não foi identificada informação correspondente nos documentos analisados.";

    // 5.3 Custos
    const orcFiles = listFileNames("ORCAMENTO");
    const orcSintetico = orcFiles.filter((n) => normalize(n).includes("sintetico") || normalize(n).includes("orcamento sintetico"));
    const composicoes = orcFiles.filter((n) => n.toLowerCase().includes("composi"));
    const memoriaCalc = orcFiles.filter((n) => n.toLowerCase().includes("memoria"));
    const cotacoes = orcFiles.filter((n) => normalize(n).includes("cotac"));
    const curvaAbc = orcFiles.filter((n) => n.toLowerCase().includes("curva"));
    const dmtFiles = orcFiles.filter((n) => n.toLowerCase().includes("dmt"));
    const custosLines: string[] = [];
    if (orcSintetico.length > 0) custosLines.push(`Orçamento Sintético: ${orcSintetico.join(", ")}.`);
    if (composicoes.length > 0) custosLines.push(`Composições de custos: ${composicoes.join(", ")}.`);
    if (memoriaCalc.length > 0) custosLines.push(`Memória de cálculo: ${memoriaCalc.join(", ")}.`);
    if (cotacoes.length > 0) custosLines.push(`Cotações: ${cotacoes.join(", ")}.`);
    if (curvaAbc.length > 0) custosLines.push(`Curva ABC: ${curvaAbc.join(", ")}.`);
    if (dmtFiles.length > 0) custosLines.push(`DMT: ${dmtFiles.join(", ")}.`);
    const custosTexto = custosLines.length > 0
      ? `Foram identificados os seguintes documentos de composição de custos:\n${custosLines.join("\n")}`
      : "Não foram identificados documentos de composição de custos.";

    // 5.4 Oneração
    const allNames = arquivos.map((a) => normalize(a.nome_original));
    const hasDesonerado = allNames.some((n) => n.includes("desonerado") || n.includes("desoneracao"));
    const hasOnerado = allNames.some((n) => n.includes("onerado") && !n.includes("desonerado"));
    let oneracaoTexto = "Não foram identificados documentos relativos à oneração ou desoneração.";
    if (hasDesonerado && hasOnerado) oneracaoTexto = "Foram identificados documentos com referência a regime desonerado e onerado.";
    else if (hasDesonerado) oneracaoTexto = "Foram identificados documentos com referência a regime desonerado.";
    else if (hasOnerado) oneracaoTexto = "Foram identificados documentos com referência a regime onerado.";

    // 5.5 BDI
    const bdiFiles = orcFiles.filter((n) => n.toLowerCase().includes("bdi"));
    const bdiTexto = bdiFiles.length > 0
      ? `Foi identificada a presença de BDI nos seguintes documentos: ${bdiFiles.join(", ")}.`
      : "Não foi identificado documento de BDI no conjunto documental apresentado.";

    // 5.6 Cronograma
    const cronoFiles = listFileNames("CRONOGRAMA");
    const cronoLines: string[] = [];
    if (cronoFiles.length > 0) cronoLines.push(`Cronograma: ${cronoFiles.join(", ")}.`);
    if (memoriais.length > 0) cronoLines.push(`Memoriais: ${memoriais.join(", ")}.`);
    const cronoTexto = cronoLines.length > 0
      ? `Foram identificados os seguintes documentos:\n${cronoLines.join("\n")}`
      : "Não foram identificados cronograma ou memoriais no conjunto documental.";

    // Objeto
    const objetoTexto = dadosMap["objeto_contratacao"] || processo.nome_processo;

    // Conclusão — neutra quando identificação é insuficiente
    const categoriasEssenciais = ["ORCAMENTO", "MEMORIAL_OU_TR", "TERMO_DE_REFERENCIA"];
    const categoriasPresentes = [...new Set(arquivos.map((a) => a.categoria).filter(Boolean))] as string[];
    const essenciaisPresentes = categoriasEssenciais.filter((c) => categoriasPresentes.includes(c));
    const identificacaoSuficiente = essenciaisPresentes.length >= 2;

    const conclusaoTexto = identificacaoSuficiente
      ? `Diante do exposto, com base na análise da documentação técnica apresentada para instruir o processo administrativo nº ${processo.numero_processo}, este parecer técnico conclui que o conjunto documental foi avaliado quanto à sua completude e consistência, à luz da Lei nº 14.133/2021.`
      : `Diante do exposto, com base na análise da documentação técnica apresentada para instruir o processo administrativo nº ${processo.numero_processo}, este parecer técnico registra que a identificação documental realizada foi parcial, não sendo possível atestar a completude do conjunto documental. Recomenda-se complementação e revisão manual antes de subsidiar o procedimento licitatório.`;

    const built: SecaoDocumento[] = [
      { key: "objeto", titulo: "1. IDENTIFICAÇÃO E OBJETO", texto: objetoTexto, nivel: "secao" },
      { key: "documentos", titulo: "2. DOCUMENTOS ANALISADOS", texto: docsGrouped, nivel: "secao" },
      { key: "assunto", titulo: "3. ASSUNTO", texto: `Elaboração de Parecer Técnico para o material apresentado, visando instruir procedimento licitatório para execução de obra pública, conforme especificações constantes nas peças técnicas que integram o processo nº ${processo.numero_processo}.`, nivel: "secao" },
      { key: "consideracoes", titulo: "4. CONSIDERAÇÕES INICIAIS", texto: "Este parecer tem por objetivo verificar se o conjunto documental apresentado possui completude, clareza e consistência documental para subsidiar a instrução do procedimento licitatório, à luz da Lei nº 14.133/2021.", nivel: "secao" },
      { key: "fundamentacao", titulo: "5. FUNDAMENTAÇÃO TÉCNICA", texto: "", nivel: "secao" },
      { key: "projetos", titulo: "5.1 PROJETOS E DEMAIS DOCUMENTOS TÉCNICOS", texto: projetosTexto, nivel: "subsecao" },
      { key: "valor", titulo: "5.2 VALOR GLOBAL ORÇADO", texto: valorTexto, nivel: "subsecao" },
      { key: "custos", titulo: "5.3 DETERMINAÇÃO DOS CUSTOS", texto: custosTexto, nivel: "subsecao" },
      { key: "oneracao", titulo: "5.4 ONERAÇÃO / DESONERAÇÃO", texto: oneracaoTexto, nivel: "subsecao" },
      { key: "bdi", titulo: "5.5 BDI", texto: bdiTexto, nivel: "subsecao" },
      { key: "cronograma", titulo: "5.6 CRONOGRAMA FÍSICO-FINANCEIRO E MEMORIAIS", texto: cronoTexto, nivel: "subsecao" },
      { key: "conclusao", titulo: "6. CONCLUSÃO – PARECER TÉCNICO", texto: conclusaoTexto, nivel: "secao" },
    ];

    setSecoes(built);
    setInitialized(true);
  }, [processo, dadosExtraidos, arquivos, pareceres, initialized]);

  const moveSection = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= secoes.length) return;
    const updated = [...secoes];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    setSecoes(updated);
  };

  const removeSection = (idx: number) => {
    setSecoes((prev) => prev.filter((_, i) => i !== idx));
  };

  const addSection = () => {
    setSecoes((prev) => [
      ...prev,
      {
        key: `nova_${Date.now()}`,
        titulo: "NOVA SEÇÃO",
        texto: "Texto da seção...",
        nivel: "subsecao",
      },
    ]);
  };

  const startEditText = (idx: number) => {
    setEditingIdx(idx);
    setEditText(secoes[idx].texto);
  };

  const saveEditText = () => {
    if (editingIdx === null) return;
    setSecoes((prev) =>
      prev.map((s, i) => (i === editingIdx ? { ...s, texto: editText } : s))
    );
    setEditingIdx(null);
  };

  const startEditTitle = (idx: number) => {
    setEditingTitleIdx(idx);
    setEditTitle(secoes[idx].titulo);
  };

  const saveEditTitle = () => {
    if (editingTitleIdx === null) return;
    setSecoes((prev) =>
      prev.map((s, i) => (i === editingTitleIdx ? { ...s, titulo: editTitle } : s))
    );
    setEditingTitleIdx(null);
  };

  const gerarDocx = useMutation({
    mutationFn: async () => {
      if (!processo) throw new Error("Processo não carregado");

      const nextVersion = (pareceres?.[0]?.versao ?? 0) + 1;

      // Filter out empty "header" sections (like fundamentação with no text)
      const secoesFinais = secoes.filter((s) => s.texto.trim() || s.nivel === "secao");

      const dados: DadosParecer = {
        numeroParecer,
        orgao: processo.orgao,
        secretaria: processo.secretaria,
        secoes: secoesFinais,
        assinatura,
      };

      // Save to DB
      const conteudo = {
        identificacao_parecer: { numero: numeroParecer, data: assinatura.data },
        identificacao_processo: {
          nome: processo.nome_processo,
          numero: processo.numero_processo,
          orgao: processo.orgao,
          secretaria: processo.secretaria,
        },
        secoes: secoesFinais,
        assinatura,
      };

      const { error } = await supabase.from("pareceres").insert([{
        processo_id: id!,
        versao: nextVersion,
        conteudo_json: conteudo as any,
      }]);
      if (error) throw error;

      await supabase.from("processos").update({ status: "concluido" as const }).eq("id", id!);

      const version = String(nextVersion).padStart(2, "0");
      await generateParecerDocx(dados, `PARECER_TECNICO_V${version}.docx`);

      return nextVersion;
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

  if (!initialized) {
    return (
      <AppLayout title="Prévia do Parecer">
        <div className="flex flex-col items-center py-12">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Montando prévia...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Prévia do Parecer">
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/validacao/${id}`)}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar à Validação
        </Button>
      </div>

      <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm text-foreground">
          <strong>Prévia do Parecer:</strong> Visualize o documento exatamente como será gerado.
          Edite textos, títulos, reordene ou adicione seções antes de gerar o DOCX final.
        </p>
      </div>

      {/* Document preview */}
      <Card className="mb-6">
        <CardContent className="p-8">
          {/* Header */}
          <div className="mb-6 text-center">
            <p className="text-sm font-bold">{processo?.orgao}</p>
            <p className="text-sm font-bold">{processo?.secretaria}</p>
          </div>

          {/* Parecer number */}
          <div className="mb-6 text-center">
            {editingTitleIdx === -1 ? (
              <div className="flex items-center justify-center gap-2">
                <Input
                  value={numeroParecer}
                  onChange={(e) => setNumeroParecer(e.target.value)}
                  className="h-8 max-w-md text-center font-bold"
                  autoFocus
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingTitleIdx(null)}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <p
                className="cursor-pointer text-base font-bold hover:text-primary"
                onClick={() => setEditingTitleIdx(-1)}
              >
                PARECER TÉCNICO {numeroParecer}
              </p>
            )}
          </div>

          <Separator className="mb-6" />

          {/* Sections */}
          {secoes.map((secao, idx) => (
            <div key={secao.key} className="group relative mb-4">
              {/* Section controls */}
              <div className="absolute -left-12 top-0 flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveSection(idx, -1)} disabled={idx === 0}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveSection(idx, 1)} disabled={idx === secoes.length - 1}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeSection(idx)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {/* Title */}
              {editingTitleIdx === idx ? (
                <div className="mb-1 flex items-center gap-2">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="h-7 text-sm font-bold"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") saveEditTitle(); if (e.key === "Escape") setEditingTitleIdx(null); }}
                  />
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEditTitle}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingTitleIdx(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <p
                  className={`mb-1 cursor-pointer font-bold hover:text-primary ${
                    secao.nivel === "secao" ? "border-b border-primary/30 pb-1 text-sm" : "text-xs"
                  }`}
                  onClick={() => startEditTitle(idx)}
                >
                  {secao.titulo}
                  <Pencil className="ml-1 inline h-3 w-3 opacity-0 group-hover:opacity-50" />
                </p>
              )}

              {/* Text */}
              {secao.texto && (
                editingIdx === idx ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="min-h-[100px] text-xs"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEditText}>
                        <Check className="mr-1 h-3 w-3" /> Salvar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingIdx(null)}>
                        <X className="mr-1 h-3 w-3" /> Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p
                    className="cursor-pointer whitespace-pre-line text-xs text-foreground hover:bg-muted/50 rounded px-1 py-0.5"
                    onClick={() => startEditText(idx)}
                  >
                    {secao.texto}
                  </p>
                )
              )}
            </div>
          ))}

          {/* Add section button */}
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={addSection}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Adicionar Seção
            </Button>
          </div>

          <Separator className="my-6" />

          {/* "É este o parecer." */}
          <p className="mb-6 text-xs italic text-foreground">É este o parecer.</p>

          {/* Signature block */}
          <div className="space-y-3 text-xs">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-muted-foreground">Local</label>
                <Input
                  value={assinatura.local}
                  onChange={(e) => setAssinatura((p) => ({ ...p, local: e.target.value }))}
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <label className="text-muted-foreground">Data</label>
                <Input
                  value={assinatura.data}
                  onChange={(e) => setAssinatura((p) => ({ ...p, data: e.target.value }))}
                  className="h-7 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="text-muted-foreground">Nome</label>
              <Input
                value={assinatura.nome}
                onChange={(e) => setAssinatura((p) => ({ ...p, nome: e.target.value }))}
                className="h-7 text-xs"
                placeholder="Nome do responsável técnico"
              />
            </div>
            <div>
              <label className="text-muted-foreground">Cargo</label>
              <Input
                value={assinatura.cargo}
                onChange={(e) => setAssinatura((p) => ({ ...p, cargo: e.target.value }))}
                className="h-7 text-xs"
                placeholder="Ex: Engenheiro Civil"
              />
            </div>
            <div>
              <label className="text-muted-foreground">Registro Profissional</label>
              <Input
                value={assinatura.registro}
                onChange={(e) => setAssinatura((p) => ({ ...p, registro: e.target.value }))}
                className="h-7 text-xs"
                placeholder="Ex: CREA-SC 123456"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between border-t pt-6">
        <Button variant="outline" onClick={() => navigate(`/validacao/${id}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar à Validação
        </Button>
        <Button
          size="lg"
          onClick={() => gerarDocx.mutate()}
          disabled={gerarDocx.isPending}
        >
          {gerarDocx.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Gerar DOCX Final
        </Button>
      </div>
    </AppLayout>
  );
};

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export default PreviaParecer;
