import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  Header,
  PageBreak,
  Tab,
  TabStopType,
  TabStopPosition,
  HeadingLevel,
} from "docx";
import { saveAs } from "file-saver";

/**
 * Gera o DOCX do Parecer Técnico seguindo o modelo institucional:
 *
 * CABEÇALHO (repetido em toda página): Órgão / Secretaria / Município
 * PARECER TÉCNICO Nº xxx
 * 1. IDENTIFICAÇÃO E OBJETO
 * 2. DOCUMENTOS ANALISADOS
 * 3. ASSUNTO
 * 4. CONSIDERAÇÕES INICIAIS
 * 5. FUNDAMENTAÇÃO TÉCNICA (5.1, 5.2, …)
 * 6. CONCLUSÃO – PARECER TÉCNICO
 * Fechamento: "É este o parecer." + local/data + nome + cargo + registro
 */
export async function generateParecerDocx(conteudo: any, filename: string) {
  const orgao = conteudo.identificacao_processo?.orgao || "Órgão";
  const secretaria = conteudo.identificacao_processo?.secretaria || "Secretaria";
  const numeroParecer = conteudo.identificacao_parecer?.numero || "";

  const children: Paragraph[] = [];

  // ══ TÍTULO DO PARECER ══
  children.push(
    centeredBold(`PARECER TÉCNICO ${numeroParecer}`, 28, { spacingAfter: 400 }),
  );

  // ══ 1. IDENTIFICAÇÃO E OBJETO ══
  children.push(sectionTitle("1. IDENTIFICAÇÃO E OBJETO"));
  pushMultilineParagraphs(children, conteudo.objeto || NOT_FOUND);

  // ══ 2. DOCUMENTOS ANALISADOS ══
  children.push(sectionTitle("2. DOCUMENTOS ANALISADOS"));
  children.push(bodyText("Foram analisados, para fins de emissão deste parecer técnico:"));
  if (conteudo.documentos_analisados?.length > 0) {
    for (const doc of conteudo.documentos_analisados) {
      children.push(bulletItem(`${doc.nome} [${doc.categoria}]`));
    }
  } else {
    children.push(bodyText("Nenhum documento analisado."));
  }
  children.push(spacer());

  // ══ 3. ASSUNTO ══
  children.push(sectionTitle("3. ASSUNTO"));
  pushMultilineParagraphs(
    children,
    conteudo.assunto ||
      "Elaboração de Parecer Técnico para o material apresentado, visando instruir procedimento licitatório, conforme especificações constantes nas peças técnicas que integram o processo.",
  );

  // ══ 4. CONSIDERAÇÕES INICIAIS ══
  children.push(sectionTitle("4. CONSIDERAÇÕES INICIAIS"));
  pushMultilineParagraphs(
    children,
    conteudo.consideracoes_iniciais ||
      "Este parecer tem por objetivo verificar se o conjunto documental apresentado possui completude, clareza e consistência documental para subsidiar a instrução do procedimento licitatório, à luz da Lei nº 14.133/2021.",
  );

  // ══ 5. FUNDAMENTAÇÃO TÉCNICA ══
  children.push(sectionTitle("5. FUNDAMENTAÇÃO TÉCNICA"));

  const subtopicosFixos = [
    { campo: "projetos_documentos", label: "PROJETOS E DEMAIS DOCUMENTOS TÉCNICOS" },
    { campo: "valor_estimado", label: "VALOR GLOBAL ORÇADO" },
    { campo: "determinacao_custos", label: "DETERMINAÇÃO DOS CUSTOS" },
    { campo: "oneracao_desoneracao", label: "ONERAÇÃO / DESONERAÇÃO" },
    { campo: "bdi", label: "BDI" },
    { campo: "cronograma", label: "CRONOGRAMA FÍSICO-FINANCEIRO E MEMORIAIS" },
  ];

  const standardFields = subtopicosFixos.map((s) => s.campo);
  let subIndex = 1;

  for (const sub of subtopicosFixos) {
    const valor = getAnaliseField(conteudo, sub.campo);
    children.push(subsectionTitle(`5.${subIndex} ${sub.label}`));
    pushMultilineParagraphs(children, valor || NOT_FOUND);
    subIndex++;
  }

  // Subtópicos extras (dinâmicos)
  if (conteudo.analise_tecnica) {
    for (const item of conteudo.analise_tecnica) {
      if (standardFields.includes(item.campo) || item.campo.startsWith("responsavel")) continue;
      children.push(subsectionTitle(`5.${subIndex} ${formatLabel(item.campo)}`));
      pushMultilineParagraphs(children, item.valor);
      subIndex++;
    }
  }
  children.push(spacer());

  // ══ 6. CONCLUSÃO – PARECER TÉCNICO ══
  children.push(sectionTitle("6. CONCLUSÃO – PARECER TÉCNICO"));
  const conclusaoText = conteudo.conclusao || conteudo.sintese || "—";
  // Split conclusion but keep "É este o parecer." on its own line
  const conclusaoParts = conclusaoText.split(/\n+/);
  for (const part of conclusaoParts) {
    if (part.trim()) {
      children.push(bodyText(part.trim()));
    }
  }
  children.push(spacer());

  // ══ 7. FECHAMENTO FORMAL ══
  const fechamento = conteudo.fechamento || {};
  const localData =
    fechamento.local_data ||
    (conteudo.identificacao_parecer?.data
      ? `${orgao}, ${conteudo.identificacao_parecer.data}.`
      : "");

  children.push(bodyText(localData));
  children.push(spacer());
  children.push(spacer());

  // Linha de assinatura
  children.push(centeredText("________________________________", 22));

  // Nome do responsável
  const nomeResponsavel =
    fechamento.responsavel || conteudo.responsavel_tecnico || "Responsável Técnico";
  children.push(centeredBold(nomeResponsavel, 22, { spacingAfter: 40 }));

  // Cargo
  if (fechamento.cargo) {
    children.push(centeredText(fechamento.cargo, 22, { spacingAfter: 40 }));
  }

  // Registro profissional
  if (fechamento.registro_profissional) {
    children.push(centeredText(fechamento.registro_profissional, 22));
  }

  // ══ Montar documento ══
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              centeredBold(orgao, 22),
              centeredBold(secretaria, 22),
              spacer(),
            ],
          }),
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename);
}

// ── Constantes ──────────────────────────────────────────────

const NOT_FOUND =
  "Não foi identificada informação correspondente nos documentos analisados.";

const FONT = "Arial";
const BODY_SIZE = 22; // 11pt

// ── Helpers ─────────────────────────────────────────────────

function getAnaliseField(conteudo: any, campo: string): string | null {
  if (!conteudo.analise_tecnica) return null;
  const item = conteudo.analise_tecnica.find((a: any) => a.campo === campo);
  return item?.valor || null;
}

function formatLabel(campo: string): string {
  return campo
    .replace(/^extra_/, "")
    .replace(/_/g, " ")
    .toUpperCase();
}

/** Push multiple paragraphs from newline-separated text */
function pushMultilineParagraphs(children: Paragraph[], text: string) {
  const lines = text.split(/\n+/);
  for (const line of lines) {
    if (line.trim()) {
      children.push(bodyText(line.trim()));
    }
  }
  children.push(spacer());
}

// ── Paragraph builders ──────────────────────────────────────

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 360, after: 120 },
    children: [
      new TextRun({ text, bold: true, size: 24, font: FONT }),
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
    spacing: { before: 240, after: 100 },
    children: [
      new TextRun({ text, bold: true, size: BODY_SIZE, font: FONT }),
    ],
  });
}

function bodyText(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 80, line: 276 },
    children: [
      new TextRun({ text, size: BODY_SIZE, font: FONT }),
    ],
  });
}

function bulletItem(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 40 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: `• ${text}`, size: BODY_SIZE, font: FONT }),
    ],
  });
}

function centeredText(text: string, size: number, opts?: { spacingAfter?: number }): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: opts?.spacingAfter ?? 0 },
    children: [
      new TextRun({ text, size, font: FONT }),
    ],
  });
}

function centeredBold(text: string, size: number, opts?: { spacingAfter?: number }): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: opts?.spacingAfter ?? 40 },
    children: [
      new TextRun({ text, bold: true, size, font: FONT }),
    ],
  });
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { after: 200 }, children: [] });
}
