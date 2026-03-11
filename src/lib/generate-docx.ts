import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
} from "docx";
import { saveAs } from "file-saver";

export interface SecaoDocumento {
  key: string;
  titulo: string;
  texto: string;
  nivel: "secao" | "subsecao";
}

export interface DadosAssinatura {
  local: string;
  data: string;
  nome: string;
  cargo: string;
  registro: string;
}

export interface DadosParecer {
  numeroParecer: string;
  orgao: string;
  secretaria: string;
  secoes: SecaoDocumento[];
  assinatura: DadosAssinatura;
}

export async function generateParecerDocx(dados: DadosParecer, filename: string) {
  const children: Paragraph[] = [];

  // === HEADER ===
  children.push(
    headerParagraph(dados.orgao),
    headerParagraph(dados.secretaria),
    spacer(),
  );

  // === PARECER TÉCNICO Nº ===
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: `PARECER TÉCNICO ${dados.numeroParecer}`,
          bold: true,
          size: 28,
          font: "Arial",
        }),
      ],
    }),
  );

  // === SEÇÕES ===
  for (const secao of dados.secoes) {
    if (secao.nivel === "secao") {
      children.push(sectionTitle(secao.titulo));
    } else {
      children.push(subsectionTitle(secao.titulo));
    }

    // Split text by newlines for proper paragraphs
    const paragraphs = secao.texto.split("\n").filter((l) => l.trim());
    for (const p of paragraphs) {
      if (p.startsWith("• ") || p.startsWith("- ")) {
        children.push(bulletParagraph(p.replace(/^[•\-]\s*/, "")));
      } else {
        children.push(textParagraph(p));
      }
    }
  }

  // === "É este o parecer." ===
  children.push(spacer());
  children.push(textParagraph("É este o parecer."));
  children.push(spacer());

  // === Assinatura ===
  if (dados.assinatura.local || dados.assinatura.data) {
    children.push(
      textParagraph(
        [dados.assinatura.local, dados.assinatura.data].filter(Boolean).join(", ") + "."
      ),
    );
  }
  children.push(spacer());
  children.push(spacer());
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: "________________________________", size: 22, font: "Arial" }),
      ],
    }),
  );
  if (dados.assinatura.nome) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: dados.assinatura.nome, bold: true, size: 22, font: "Arial" }),
        ],
      }),
    );
  }
  if (dados.assinatura.cargo) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: dados.assinatura.cargo, size: 22, font: "Arial" }),
        ],
      }),
    );
  }
  if (dados.assinatura.registro) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: dados.assinatura.registro, size: 22, font: "Arial" }),
        ],
      }),
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename);
}

// === Legacy support: accept old format from ResultadoFinal ===
export async function generateParecerDocxLegacy(conteudo: any, filename: string) {
  const orgao = conteudo.identificacao_processo?.orgao || "Órgão";
  const secretaria = conteudo.identificacao_processo?.secretaria || "Secretaria";
  const numeroParecer = conteudo.identificacao_parecer?.numero || "";

  const secoes: SecaoDocumento[] = [];

  // Build sections from legacy format
  if (conteudo.objeto) {
    secoes.push({ key: "objeto", titulo: "1. IDENTIFICAÇÃO E OBJETO", texto: conteudo.objeto, nivel: "secao" });
  }

  if (conteudo.documentos_analisados?.length > 0) {
    const grouped = groupDocuments(conteudo.documentos_analisados);
    secoes.push({ key: "docs", titulo: "2. DOCUMENTOS ANALISADOS", texto: grouped, nivel: "secao" });
  }

  if (conteudo.assunto) {
    secoes.push({ key: "assunto", titulo: "3. ASSUNTO", texto: conteudo.assunto, nivel: "secao" });
  }

  if (conteudo.consideracoes_iniciais) {
    secoes.push({ key: "consideracoes", titulo: "4. CONSIDERAÇÕES INICIAIS", texto: conteudo.consideracoes_iniciais, nivel: "secao" });
  }

  // Fundamentação técnica subsections
  if (conteudo.analise_tecnica) {
    const subsecaoMap: Record<string, string> = {
      projetos_documentos: "5.1 PROJETOS E DEMAIS DOCUMENTOS TÉCNICOS",
      valor_estimado: "5.2 VALOR GLOBAL ORÇADO",
      determinacao_custos: "5.3 DETERMINAÇÃO DOS CUSTOS",
      oneracao_desoneracao: "5.4 ONERAÇÃO / DESONERAÇÃO",
      bdi: "5.5 BDI",
      cronograma: "5.6 CRONOGRAMA FÍSICO-FINANCEIRO E MEMORIAIS",
    };
    for (const item of conteudo.analise_tecnica) {
      const titulo = subsecaoMap[item.campo] || item.campo.toUpperCase();
      secoes.push({ key: item.campo, titulo, texto: item.valor, nivel: "subsecao" });
    }
  }

  if (conteudo.sintese || conteudo.conclusao) {
    secoes.push({ key: "conclusao", titulo: "6. CONCLUSÃO – PARECER TÉCNICO", texto: conteudo.sintese || conteudo.conclusao, nivel: "secao" });
  }

  await generateParecerDocx({
    numeroParecer,
    orgao,
    secretaria,
    secoes,
    assinatura: {
      local: orgao,
      data: conteudo.identificacao_parecer?.data || "",
      nome: conteudo.responsavel_tecnico || "",
      cargo: conteudo.cargo || "",
      registro: conteudo.registro_profissional || "",
    },
  }, filename);
}

function groupDocuments(docs: { nome: string; categoria: string }[]): string {
  const categoryLabels: Record<string, string> = {
    TERMO_DE_REFERENCIA: "TR – Termo de Referência",
    MEMORIAL_OU_TR: "MD – Memorial Descritivo",
    CADASTRO_TOPOGRAFIA: "CAT – Cadastro / Topografia",
    DRENAGEM: "DRE – Drenagem",
    URBANIZACAO_SINALIZACAO: "URB – Urbanização / Sinalização",
    ORCAMENTO: "ORC – Orçamento",
    COTACAO_OU_PROPOSTA: "COT – Cotações / Propostas",
    CRONOGRAMA: "CRO – Cronograma",
    RESPONSABILIDADE_TECNICA: "ART/RRT – Responsabilidade Técnica",
    ADMINISTRATIVO: "ADM – Administrativo",
    MODELO: "MOD – Modelo / Template",
    OUTROS: "Complementares",
  };

  const grouped: Record<string, string[]> = {};
  for (const doc of docs) {
    const cat = doc.categoria || "OUTROS";
    if (!grouped[cat]) grouped[cat] = [];
    // Extract just filename from path
    const shortName = doc.nome.split("/").pop() || doc.nome;
    grouped[cat].push(shortName);
  }

  const lines: string[] = [];
  for (const [cat, files] of Object.entries(grouped)) {
    const label = categoryLabels[cat] || cat;
    lines.push(label + ":");
    for (const f of files) {
      lines.push(`• ${f}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export { groupDocuments };

function headerParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [
      new TextRun({ text, bold: true, size: 24, font: "Arial" }),
    ],
  });
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 300, after: 120 },
    children: [
      new TextRun({ text, bold: true, size: 24, font: "Arial" }),
    ],
    border: {
      bottom: {
        color: "2B4C7E",
        style: BorderStyle.SINGLE,
        size: 6,
        space: 4,
      },
    },
  });
}

function subsectionTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({ text, bold: true, size: 22, font: "Arial" }),
    ],
  });
}

function textParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text, size: 22, font: "Arial" }),
    ],
  });
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 40 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: `• ${text}`, size: 22, font: "Arial" }),
    ],
  });
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { after: 200 }, children: [] });
}
