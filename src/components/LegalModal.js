import React from "react";
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity } from "react-native";
import { colors, radius, spacing } from "../config/theme";

// Parser de markdown ligero (#, ##, **negrita**, - listas) — mismo formato
// simple que usa la web en legalContent.ts, sin librerías externas.
function renderLegalMarkdown(md) {
  const lines = md.split("\n");
  const blocks = [];
  let listBuffer = [];

  const flushList = (key) => {
    if (listBuffer.length) {
      blocks.push(
        <View key={`list-${key}`} style={styles.list}>
          {listBuffer.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.listBullet}>•</Text>
              <Text style={styles.listText}>{renderInline(item)}</Text>
            </View>
          ))}
        </View>
      );
      listBuffer = [];
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      listBuffer.push(trimmed.slice(2));
      return;
    }
    flushList(idx);

    if (!trimmed) return;
    if (trimmed.startsWith("## ")) {
      blocks.push(<Text key={idx} style={styles.h2}>{trimmed.slice(3)}</Text>);
    } else if (trimmed.startsWith("### ")) {
      blocks.push(<Text key={idx} style={styles.h3}>{trimmed.slice(4)}</Text>);
    } else if (trimmed.startsWith("# ")) {
      blocks.push(<Text key={idx} style={styles.h1}>{trimmed.slice(2)}</Text>);
    } else {
      blocks.push(<Text key={idx} style={styles.p}>{renderInline(trimmed)}</Text>);
    }
  });
  flushList("end");
  return blocks;
}

// Convierte **negrita** dentro de una línea en spans <Text style={bold}>
function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <Text key={i} style={styles.bold}>{part.slice(2, -2)}</Text>;
    }
    return <Text key={i}>{part}</Text>;
  });
}

export default function LegalModal({ visible, title, content, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 8 }}>
            {renderLegalMarkdown(content)}
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex:1, backgroundColor:"rgba(15,23,42,0.45)", alignItems:"center", justifyContent:"center", padding:16 },
  card: { backgroundColor:"#fff", borderRadius:radius.lg, width:"100%", maxHeight:"85%", overflow:"hidden" },
  header: { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:20, paddingVertical:16, borderBottomWidth:1, borderBottomColor:colors.border },
  title: { fontSize:16, fontWeight:"800", color:colors.text },
  closeIcon: { fontSize:18, color:colors.textMuted },
  body: { paddingHorizontal:20, paddingVertical:16 },
  footer: { paddingHorizontal:20, paddingVertical:12, borderTopWidth:1, borderTopColor:colors.border },
  closeBtn: { backgroundColor:colors.primary, borderRadius:radius.md, paddingVertical:12, alignItems:"center" },
  closeBtnText: { color:"#fff", fontWeight:"700", fontSize:14 },
  h1: { fontSize:18, fontWeight:"800", color:colors.text, marginTop:spacing.md, marginBottom:spacing.sm },
  h2: { fontSize:15, fontWeight:"800", color:colors.text, marginTop:spacing.md, marginBottom:spacing.xs },
  h3: { fontSize:13, fontWeight:"700", color:colors.textSecondary, marginTop:spacing.sm, marginBottom:spacing.xs },
  p:  { fontSize:13, lineHeight:19, color:colors.textSecondary, marginBottom:spacing.sm },
  bold: { fontWeight:"700", color:colors.text },
  list: { marginBottom:spacing.sm },
  listItem: { flexDirection:"row", marginBottom:4, paddingLeft:4 },
  listBullet: { color:colors.textMuted, marginRight:6, fontSize:13 },
  listText: { flex:1, fontSize:13, lineHeight:19, color:colors.textSecondary },
});
