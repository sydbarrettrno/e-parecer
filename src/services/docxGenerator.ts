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

  // === CABEÇALHO INSTITUCIONAL ===
  children.push(
    headerParagraph(orgao),
    headerParagraph(secretaria),
    spacer(),
  );

  // === TÍTULO DO PARECER ===
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
    conteudo.documentos_analisados.forEach((doc: any) => {
      children.push(bulletParagraph(`${doc.nome} [${doc.categoria}]`));
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
        "Elaboração de Parecer Técnico para o material apresentado, visando instruir procedimento licitatório, conforme especificações constantes nas peças técnicas que integram o processo."
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

  // === 5. FUNDAMENTAÇÃO TÉCNICA (subtópicos variáveis) ===
  children.push(sectionTitle("5. FUNDAMENTAÇÃO TÉCNICA"));

  const subtopicosFixos = [
    { campo: "projetos_documentos", label: "PROJETOS E DEMAIS DOCUMENTOS TÉCNICOS" },
    { campo: "valor_estimado", label: "VALOR GLOBAL ORÇADO" },
    { campo: "determinacao_custos", label: "DETERMINAÇÃO DOS CUSTOS" },
    { campo: "oneracao_desoneracao", label: "ONERAÇÃO / DESONERAÇÃO" },
    { campo: "bdi", label: "BDI" },
    { campo: "cronograma", label: "CRONOGRAMA FÍSICO-FINANCEIRO E MEMORIAIS" },
  ];

  const NOT_FOUND = "Não foi identificada informação correspondente nos documentos analisados.";
  const standardFields = subtopicosFixos.map((s) => s.campo);

  let subIndex = 1;
  for (const sub of subtopicosFixos) {
    children.push(subsectionTitle(`5.${subIndex} ${sub.label}`));
    children.push(textParagraph(getAnaliseField(conteudo, sub.campo) || NOT_FOUND));
    subIndex++;
  }

  // Subtópicos extras da análise técnica
  if (conteudo.analise_tecnica) {
    conteudo.analise_tecnica
      .filter((item: any) => !standardFields.includes(item.campo) && !item.campo.startsWith("responsavel"))
      .forEach((item: any) => {
        children.push(subsectionTitle(`5.${subIndex} ${item.campo.toUpperCase()}`));
        children.push(textParagraph(item.valor));
        subIndex++;
      });
  }
  children.push(spacer());

  // === 6. CONCLUSÃO – PARECER TÉCNICO ===
  children.push(sectionTitle("6. CONCLUSÃO – PARECER TÉCNICO"));
  children.push(
    textParagraph(conteudo.conclusao || conteudo.sintese || "—"),
  );
  children.push(spacer());

  // === 7. FECHAMENTO FORMAL ===
  const fechamento = conteudo.fechamento || {};
  const localData = fechamento.local_data ||
    (conteudo.identificacao_parecer?.data
      ? `${orgao}, ${conteudo.identificacao_parecer.data}.`
      : "");

  children.push(textParagraph(localData));
  children.push(spacer());
  children.push(spacer());

  // Linha de assinatura
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "________________________________", size: 22, font: "Arial" }),
      ],
    }),
  );

  // Nome do responsável
  const nomeResponsavel = fechamento.responsavel || conteudo.responsavel_tecnico || "Responsável Técnico";
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({ text: nomeResponsavel, bold: true, size: 22, font: "Arial" }),
      ],
    }),
  );

  // Cargo
  if (fechamento.cargo) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [
          new TextRun({ text: fechamento.cargo, size: 22, font: "Arial" }),
        ],
      }),
    );
  }

  // Registro profissional
  if (fechamento.registro_profissional) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: fechamento.registro_profissional, size: 22, font: "Arial" }),
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
