import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { headingSeparator } from "@/lib/clauseHeading";
import { fieldDisplayValue } from "@/lib/documentFields";
import type { DocumentDetail, DocumentFields } from "@/types/document";

// The app's palette, carried onto the page. Colour is confined to the
// letterhead rule; everything else is plum, muted brown, or black on white, so
// the agreement reads as an agreement in print and survives a mono printer.
const PLUM = "#241520";
const MUTED = "#6f5f5a";
const LINE = "#ddd0bb";

// The sun's four rings, unrolled - the same warm ramp the app wears.
const SUN_RAMP = ["#ecad0a", "#d38a12", "#b8601f", "#8f3a1a"];

const styles = StyleSheet.create({
  page: {
    paddingVertical: 48,
    paddingHorizontal: 56,
    fontSize: 10.5,
    lineHeight: 1.5,
    fontFamily: "Times-Roman",
  },
  letterhead: { flexDirection: "row", marginBottom: 16 },
  letterheadStripe: { height: 2.5, width: 14 },
  title: { fontSize: 16, fontFamily: "Times-Bold", color: PLUM, marginBottom: 16 },
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
  fieldLabel: { width: 160, color: MUTED },
  fieldValue: { flex: 1, fontFamily: "Times-Bold" },
  fieldValueEmpty: { flex: 1, color: MUTED, fontStyle: "italic" },
  paragraph: { marginBottom: 8 },
  paragraphNested: { marginBottom: 8, marginLeft: 20 },
  clauseNumber: { fontFamily: "Courier-Bold", fontSize: 9.5, color: MUTED },
  bold: { fontFamily: "Times-Bold" },
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
          {SUN_RAMP.map((color) => (
            <View key={color} style={[styles.letterheadStripe, { backgroundColor: color }]} />
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
