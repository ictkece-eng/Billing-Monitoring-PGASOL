
// Fix: Adhering to strict @google/genai import rules
import { GoogleGenAI } from "@google/genai";
import { BudgetRecord } from "../types";

export const getBudgetInsights = async (data: BudgetRecord[]): Promise<string> => {
  // Pengecekan keamanan: Pastikan API_KEY tersedia di Environment Variables
  const apiKey = process.env.API_KEY;
  
  if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
    return "Konfigurasi AI belum lengkap. Jika Anda men-deploy ke Vercel, pastikan sudah menambahkan 'API_KEY' di bagian Environment Variables pada Project Settings.";
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Agregasi data agar lebih efisien dan menjaga privasi (hanya mengirim ringkasan total)
  const summary = data.reduce((acc, curr) => {
    acc[curr.tim] = (acc[curr.tim] || 0) + curr.nilaiTagihan;
    return acc;
  }, {} as Record<string, number>);

  const prompt = `Analisis ringkasan budget berikut: ${JSON.stringify(summary)}. 
  Berikan analisis singkat dalam Bahasa Indonesia mengenai tim dengan pengeluaran tertinggi dan saran efisiensi. Jangan terlalu panjang.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Asisten AI tidak memberikan jawaban.";
  } catch (error: any) {
    console.error("Gemini Error:", error);
    if (error.message?.includes("API key")) {
      return "Kunci API tidak valid. Periksa kembali konfigurasi API_KEY Anda.";
    }
    return "Terjadi kesalahan koneksi saat menghubungi asisten AI. Silakan coba lagi nanti.";
  }
};
