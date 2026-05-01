// =====================================================================
// Form Validasyonları (Zod) — AI_Investigator_v4.md §9
// =====================================================================

import { z } from 'zod';

const turkishLetters = /^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/;

export const newCaseSchema = z.object({
  suspect_tc: z
    .string()
    .length(11, 'TC kimlik 11 haneli olmalı')
    .regex(/^\d+$/, 'TC kimlik sadece rakam olmalı'),
  suspect_name: z
    .string()
    .min(2, 'Ad en az 2 karakter olmalı')
    .regex(turkishLetters, 'Sadece harf girilmeli'),
  suspect_surname: z
    .string()
    .min(2, 'Soyad en az 2 karakter olmalı')
    .regex(turkishLetters, 'Sadece harf girilmeli'),
  suspect_age: z
    .number({ invalid_type_error: 'Yaş sayısal olmalı' })
    .int('Yaş tam sayı olmalı')
    .min(1, 'Geçerli bir yaş giriniz')
    .max(150, 'Geçerli bir yaş giriniz'),
  suspect_gender: z.enum(['erkek', 'kadın'], {
    required_error: 'Cinsiyet seçimi zorunlu',
  }),
  crime_type: z.string().min(2, 'Suç türü en az 2 karakter'),
  crime_scene_notes: z.string().min(10, 'En az 10 karakter giriniz'),
  initial_statement: z.string().min(10, 'En az 10 karakter giriniz'),
});

export type NewCaseFormValues = z.infer<typeof newCaseSchema>;
