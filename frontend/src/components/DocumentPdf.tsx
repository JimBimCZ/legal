import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { headingSeparator } from "@/lib/clauseHeading";
import { fieldDisplayValue } from "@/lib/documentFields";
import type { DocumentDetail, DocumentFields } from "@/types/document";

// Strictly monochrome, unlike the app: the screen spends its one accent on
// what is still unanswered, but a downloaded agreement is finished, and a red
// mark in a printed contract reads as a correction rather than a signal.
const INK = "#09090b";
const MUTED = "#52525b";
const LINE = "#d4d4d8";

// The measure, every tick struck - the same mark the app wears, at rest.
const LETTERHEAD_TICKS = 8;

const styles = StyleSheet.create({
  // Helvetica rather than Times: the screen sets the whole product in one
  // clear grotesque, and Helvetica is the closest of react-pdf's three
  // built-in standard families, so the printed page matches with no font
  // files to bundle and nothing to fetch at generation time.
  page: {
    paddingVertical: 48,
    paddingHorizontal: 56,
    fontSize: 10,
    lineHeight: 1.6,
    fontFamily: "Helvetica",
    color: INK,
  },
  letterhead: { flexDirection: "row", gap: 1, marginBottom: 16 },
  letterheadTick: { height: 3, width: 13, backgroundColor: INK },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 16 },
  sectionHeading: {
    fontSize: 8.5,
    fontFamily: "Courier-Bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
  },
  fieldRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
  },
  fieldLabel: { width: 160, fontFamily: "Courier", fontSize: 8.5, color: MUTED },
  fieldValue: { flex: 1, fontFamily: "Helvetica-Bold" },
  fieldValueEmpty: { flex: 1, color: MUTED, fontStyle: "italic" },
  paragraph: { marginBottom: 8 },
  paragraphNested: { marginBottom: 8, marginLeft: 20 },
  clauseNumber: { fontFamily: "Courier", fontSize: 9, color: MUTED },
  bold: { fontFamily: "Helvetica-Bold" },
  attribution: { marginTop: 20, fontSize: 8, color: MUTED, fontFamily: "Courier" },
});

interface DocumentPdfProps {
  documentDetail: DocumentDetail;
  values: DocumentFields;
}

export function DocumentPdf({ documentDetail, values }: DocumentPdfProps) {
  return (
    <Document title={documentDetail.name}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.letterhead}>
          {Array.from({ length: LETTERHEAD_TICKS }, (_, index) => (
            <View key={index} style={styles.letterheadTick} />
          ))}
        </View>
        <Text style={styles.title}>{documentDetail.name}</Text>

        <Text style={styles.sectionHeading}>Fields</Text>
        {documentDetail.fields.map((field) => {
          const { text, filled } = fieldDisplayValue(field.key, documentDetail.fields, values);
          return (
            <View key={field.key} style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{field.label}</Text>
              <Text style={filled ? styles.fieldValue : styles.fieldValueEmpty}>{text}</Text>
            </View>
          );
        })}

        <Text style={styles.sectionHeading}>Standard Terms</Text>
        {documentDetail.blocks.map((block, index) => (
          <Text key={index} style={block.level === 2 ? styles.paragraphNested : styles.paragraph}>
            <Text style={styles.clauseNumber}>{block.number}. </Text>
            {block.heading && (
              <Text style={styles.bold}>
                {block.heading}
                {headingSeparator(block)}
              </Text>
            )}
            {block.runs.map((run, runIndex) => {
              if (run.kind === "field") {
                const { text } = fieldDisplayValue(run.fieldKey, documentDetail.fields, values);
                return (
                  <Text key={runIndex} style={styles.bold}>
                    {text}
                  </Text>
                );
              }
              return (
                <Text key={runIndex} style={run.bold ? styles.bold : undefined}>
                  {run.text}
                </Text>
              );
            })}
          </Text>
        ))}

        <Text style={styles.attribution}>{documentDetail.sourceAttribution}</Text>
      </Page>
    </Document>
  );
}
