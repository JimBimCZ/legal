import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { fieldDisplayValue } from "@/lib/documentFields";
import type { DocumentDetail, DocumentFields } from "@/types/document";

const NAVY = "#032147";
const BLUE = "#209dd7";
const YELLOW = "#ecad0a";
const GRAY = "#888888";
const LINE = "#dfe4ea";

const styles = StyleSheet.create({
  page: {
    paddingVertical: 48,
    paddingHorizontal: 56,
    fontSize: 10.5,
    lineHeight: 1.5,
    fontFamily: "Times-Roman",
  },
  letterhead: { height: 2, width: 40, backgroundColor: NAVY, marginBottom: 3 },
  letterheadAccent: { height: 2, width: 14, backgroundColor: YELLOW, marginBottom: 16 },
  title: { fontSize: 17, fontFamily: "Times-Bold", color: NAVY, marginBottom: 16 },
  sectionHeading: {
    fontSize: 8.5,
    fontFamily: "Courier-Bold",
    color: BLUE,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
  },
  fieldRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
  },
  fieldLabel: { width: 160, color: GRAY },
  fieldValue: { flex: 1, fontFamily: "Times-Bold" },
  fieldValueEmpty: { flex: 1, color: GRAY, fontStyle: "italic" },
  paragraph: { marginBottom: 8 },
  paragraphNested: { marginBottom: 8, marginLeft: 20 },
  clauseNumber: { fontFamily: "Courier-Bold", fontSize: 9.5, color: NAVY },
  bold: { fontFamily: "Times-Bold" },
  attribution: { marginTop: 20, fontSize: 8, color: GRAY, fontFamily: "Courier" },
});

interface DocumentPdfProps {
  documentDetail: DocumentDetail;
  values: DocumentFields;
}

export function DocumentPdf({ documentDetail, values }: DocumentPdfProps) {
  return (
    <Document title={documentDetail.name}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.letterhead} />
        <View style={styles.letterheadAccent} />
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
            {block.heading && <Text style={styles.bold}>{block.heading}. </Text>}
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
