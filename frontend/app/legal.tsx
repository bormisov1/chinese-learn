import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { LEGAL_CREDITS, legalUrl } from "@/legal";
import { colors } from "@/theme";
import { shell } from "@/ui";

function OpenLink({ label, url }: { label: string; url: string }) {
  return <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(legalUrl(url, Platform.OS))} style={styles.link}>
    <Text style={styles.linkText}>{label}</Text>
    <Ionicons name="open-outline" size={14} color={colors.green} />
  </Pressable>;
}

export default function Legal() {
  return <ScrollView contentContainerStyle={[shell.content, styles.content]}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="arrow-back" size={24} color={colors.green} />
      </Pressable>
      <View>
        <Text style={styles.eyebrow}>HANZI DECK</Text>
        <Text style={styles.title}>Legal & credits</Text>
      </View>
    </View>

    <View style={[shell.panel, styles.notice]}>
      <Text style={styles.sectionTitle}>AI-generated content at runtime</Text>
      <Text style={styles.body}>When you request an AI feature, DeepSeek generates practice sentences and translations, answer evaluations, corrections and feedback, word and sentence explanations, missing-word translations, chat replies, chat titles, and word suggestions. AI output may be inaccurate. Requests go directly from your device using your API key.</Text>
      <OpenLink label="DeepSeek terms" url="https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html" />
      <OpenLink label="DeepSeek privacy policy" url="https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html" />
    </View>

    <View style={[shell.panel, styles.notice]}>
      <Text style={styles.sectionTitle}>Original Hanzi Deck content</Text>
      <Text style={styles.body}>Russian and Thai translations, app text, app icon, and other original artwork are developer-created Hanzi Deck content. All rights reserved unless a notice below says otherwise.</Text>
    </View>

    {LEGAL_CREDITS.map(item => <View key={item.name} style={[shell.panel, styles.credit]}>
      <Text style={styles.creditName}>{item.name}</Text>
      <Text style={styles.license}>{item.license}</Text>
      <Text style={styles.body}>{item.use}</Text>
      <View style={styles.links}>
        {item.source ? <OpenLink label="Source" url={item.source} /> : null}
        {item.fullText ? <OpenLink label="Full license / terms" url={item.fullText} /> : null}
        {item.notice ? <OpenLink label="Attribution notice" url={item.notice} /> : null}
        {item.adaptedData ? <OpenLink label="Adapted data" url={item.adaptedData} /> : null}
      </View>
    </View>)}

    <View style={[shell.panel, styles.notice]}>
      <Text style={styles.sectionTitle}>All bundled software</Text>
      <Text style={styles.body}>Versions, source references, copyright notices, and full license texts for production dependencies are included in the generated third-party report.</Text>
      <OpenLink label="Third-party license report" url="/legal/third-party-software.txt" />
      <OpenLink label="Pinned sources and hashes" url="/legal/provenance.json" />
      <OpenLink label="Privacy policy" url="/privacy.html" />
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 24, paddingBottom: 80, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 },
  back: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.coral, fontSize: 10, fontWeight: "800", letterSpacing: 1.6 },
  title: { color: colors.ink, fontSize: 30, fontWeight: "900" },
  notice: { padding: 18 },
  credit: { padding: 18 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  creditName: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  license: { color: colors.green, fontWeight: "800", marginTop: 4 },
  body: { color: colors.muted, lineHeight: 21, marginTop: 7 },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10 },
  link: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10 },
  linkText: { color: colors.green, fontWeight: "700" },
});
