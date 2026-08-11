import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { buildCoverPageRows, buildStandardTerms } from "@/lib/buildDocument";
import { SOURCE_ATTRIBUTION, STANDARD_TERMS_TITLE } from "@/lib/mutualNdaContent";
import type { MutualNdaFields } from "@/types/nda";

const styles = StyleSheet.create({
  page: { paddingVertical: 48, paddingHorizontal: 56, fontSize: 10.5, lineHeight: 1.5 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 16 },
  sectionHeading: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
  },
  coverRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e4e4e7",
  },
  coverLabel: { width: 160, color: "#71717a" },
  coverValue: { flex: 1 },
  coverValueEmpty: { flex: 1, color: "#a1a1aa", fontStyle: "italic" },
  paragraph: { marginBottom: 8 },
  bold: { fontFamily: "Helvetica-Bold" },
  attribution: { marginTop: 20, fontSize: 8, color: "#a1a1aa" },
});

export function NdaPdfDocument({ fields }: { fields: MutualNdaFields }) {
  const coverRows = buildCoverPageRows(fields);
  const sections = buildStandardTerms(fields);

  return (
    <Document title="Mutual Non-Disclosure Agreement">
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>Mutual Non-Disclosure Agreement</Text>

        <Text style={styles.sectionHeading}>Cover Page</Text>
        {coverRows.map((row) => (
          <View key={row.key} style={styles.coverRow}>
            <Text style={styles.coverLabel}>{row.label}</Text>
            <Text style={row.filled ? styles.coverValue : styles.coverValueEmpty}>{row.value}</Text>
          </View>
        ))}

        <Text style={styles.sectionHeading}>{STANDARD_TERMS_TITLE}</Text>
        {sections.map((section) => (
          <Text key={section.number} style={styles.paragraph}>
            <Text style={styles.bold}>{section.number}. </Text>
            {section.runs.map((run, index) => (
              <Text key={index} style={run.kind === "text" && !run.bold ? undefined : styles.bold}>
                {run.text}
              </Text>
            ))}
          </Text>
        ))}

        <Text style={styles.attribution}>{SOURCE_ATTRIBUTION}</Text>
      </Page>
    </Document>
  );
}
