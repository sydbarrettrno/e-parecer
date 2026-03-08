import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
} from "docx";
import { saveAs } from "file-saver";

export async function generateParecerDocx(conteudo: any, filename: string) {
  const orgao = conteudo.identificacao_processo?.orgao || "Órgão";
  const secretaria = conteudo.identificacao_processo?.secretaria || "Secretaria";
  const numeroParecer = conteudo.identificacao_parecer?.numero || "";

  const children: Paragraph[] = [];

  // === HEADER ===
  children.push(
    headerParagraph(orgao),
    headerParagraph(secretaria),
    spacer(),
  );

  // === PARECER TÉCNICO Nº ===
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: `PARECER TÉCNICO ${numeroParecer}`,
          bold: true,
          size: 28,
          font: "Arial",
        }),
      ],
    }),
  );

  // === 1. IDENTIFICAÇÃO E OBJETO ===
  children.push(sectionTitle("1. IDENTIFICAÇÃO E OBJETO"));
  children.push(
    textParagraph(
      conteudo.objeto ||
        "Não foi identificada informação correspondente nos documentos analisados."
    ),
  );
  children.push(spacer());

  // === 2. DOCUMENTOS ANALISADOS ===
  children.push(sectionTitle("2. DOCUMENTOS ANALISADOS"));
  children.push(
    textParagraph("Foram analisados, para fins de emissão deste parecer técnico:"),
  );
  if (conteudo.documentos_analisados?.length > 0) {
    conteudo.documentos_analisados.forEach((doc: any, i: number) => {
      children.push(
        bulletParagraph(`${doc.nome} [${doc.categoria}]`),
      );
    });
  } else {
    children.push(textParagraph("Nenhum documento analisado."));
  }
  children.push(spacer());

  // === 3. ASSUNTO ===
  children.push(sectionTitle("3. ASSUNTO"));
  children.push(
    textParagraph(
      conteudo.assunto ||
        `Elaboração de Parecer Técnico para o material apresentado, visando instruir procedimento licitatório, conforme especificações constantes nas peças técnicas que integram o processo.`
    ),
  );
  children.push(spacer());

  // === 4. CONSIDERAÇÕES INICIAIS ===
  children.push(sectionTitle("4. CONSIDERAÇÕES INICIAIS"));
  children.push(
    textParagraph(
      conteudo.consideracoes_iniciais ||
        "Este parecer tem por objetivo verificar se o conjunto documental apresentado possui completude, clareza e consistência documental para subsidiar a instrução do procedimento licitatório, à luz da Lei nº 14.133/2021."
    ),
  );
  children.push(spacer());

  // === 5. FUNDAMENTAÇÃO TÉCNICA ===
  children.push(sectionTitle("5. FUNDAMENTAÇÃO TÉCNICA"));

  // 5.1 Projetos e Documentos Técnicos
  children.push(subsectionTitle("5.1 PROJETOS E DEMAIS DOCUMENTOS TÉCNICOS"));
  children.push(
    textParagraph(
      getAnaliseField(conteudo, "projetos_documentos") ||
        "Não foi identificada informação correspondente nos documentos analisados."
    ),
  );

  // 5.2 Valor Global Orçado
  children.push(subsectionTitle("5.2 VALOR GLOBAL ORÇADO"));
  children.push(
    textParagraph(
      getAnaliseField(conteudo, "valor_estimado") ||
        getAnaliseField(conteudo, "VALOR ESTIMADO") ||
        "Não foi identificada informação correspondente nos documentos analisados."
    ),
  );

  // 5.3 Determinação dos Custos
  children.push(subsectionTitle("5.3 DETERMINAÇÃO DOS CUSTOS"));
  children.push(
    textParagraph(
      getAnaliseField(conteudo, "determinacao_custos") ||
        "Não foi identificada informação correspondente nos documentos analisados."
    ),
  );

  // 5.4 Oneração / Desoneração
  children.push(subsectionTitle("5.4 ONERAÇÃO / DESONERAÇÃO"));
  children.push(
    textParagraph(
      getAnaliseField(conteudo, "oneracao_desoneracao") ||
        "Não foi identificada informação correspondente nos documentos analisados."
    ),
  );

  // 5.5 BDI
  children.push(subsectionTitle("5.5 BDI"));
  children.push(
    textParagraph(
      getAnaliseField(conteudo, "bdi") ||
        "Não foi identificada informação correspondente nos documentos analisados."
    ),
  );

  // 5.6 Cronograma
  children.push(subsectionTitle("5.6 CRONOGRAMA FÍSICO-FINANCEIRO E MEMORIAIS"));
  children.push(
    textParagraph(
      getAnaliseField(conteudo, "cronograma") ||
        "Não foi identificada informação correspondente nos documentos analisados."
    ),
  );

  // Additional analysis sections from analise_tecnica
  const standardFields = [
    "projetos_documentos", "valor_estimado", "VALOR ESTIMADO",
    "determinacao_custos", "oneracao_desoneracao", "bdi", "cronograma",
    "RESPONSÁVEL TÉCNICO", "responsavel_tecnico",
  ];
  let subIndex = 7;
  if (conteudo.analise_tecnica) {
    conteudo.analise_tecnica
      .filter((item: any) => !standardFields.includes(item.campo))
      .forEach((item: any) => {
        children.push(subsectionTitle(`5.${subIndex} ${item.campo.toUpperCase()}`));
        children.push(textParagraph(item.valor));
        if (item.origem) {
          children.push(metaParagraph(`Origem: ${item.origem}`));
        }
        subIndex++;
      });
  }
  children.push(spacer());

  // === 6. CONCLUSÃO – PARECER TÉCNICO ===
  children.push(sectionTitle("6. CONCLUSÃO – PARECER TÉCNICO"));
  children.push(
    textParagraph(
      conteudo.sintese ||
        conteudo.conclusao ||
        "—"
    ),
  );
  children.push(textParagraph("É este o parecer."));
  children.push(spacer());

  // === Inconsistências (se houver) ===
  if (conteudo.inconsistencias && conteudo.inconsistencias !== "Não foram identificadas inconsistências graves nos documentos analisados.") {
    children.push(sectionTitle("REGISTRO DE INCONSISTÊNCIAS GRAVES"));
    children.push(textParagraph(conteudo.inconsistencias));
    children.push(spacer());
  }

  // === Complementação (se houver) ===
  if (conteudo.complementacao) {
    children.push(sectionTitle("SOLICITAÇÃO DE COMPLEMENTAÇÃO DOCUMENTAL"));
    children.push(textParagraph(conteudo.complementacao));
    children.push(spacer());
  }

  // === Assinatura ===
  children.push(
    textParagraph(
      conteudo.identificacao_parecer?.data
        ? `${conteudo.identificacao_processo?.orgao || ""}, ${conteudo.identificacao_parecer.data}.`
        : ""
    ),
  );
  children.push(spacer());
  children.push(spacer());
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: "________________________________",
          size: 22,
          font: "Arial",
        }),
      ],
    }),
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: conteudo.responsavel_tecnico || "Responsável Técnico",
          bold: true,
          size: 22,
          font: "Arial",
        }),
      ],
    }),
  );

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

function getAnaliseField(conteudo: any, campo: string): string | null {
  if (!conteudo.analise_tecnica) return null;
  const item = conteudo.analise_tecnica.find((a: any) => a.campo === campo);
  return item?.valor || null;
}

function headerParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24,
        font: "Arial",
      }),
    ],
  });
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 300, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24,
        font: "Arial",
      }),
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
      new TextRun({
        text,
        bold: true,
        size: 22,
        font: "Arial",
      }),
    ],
  });
}

function textParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({
        text,
        size: 22,
        font: "Arial",
      }),
    ],
  });
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 40 },
    indent: { left: 360 },
    children: [
      new TextRun({
        text: `• ${text}`,
        size: 22,
        font: "Arial",
      }),
    ],
  });
}

function metaParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({
        text,
        size: 18,
        italics: true,
        font: "Arial",
        color: "666666",
      }),
    ],
  });
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { after: 200 }, children: [] });
}
