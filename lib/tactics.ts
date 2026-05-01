// =====================================================================
// Taktik Kataloğu — 15 taktik (orijinal 14 + exploit_weakness)
// AI_Investigator_v4.md §7.2 + planımıza göre 15. taktik eklendi.
// =====================================================================

export type TacticDirection = 'up' | 'down';

export interface TacticDefinition {
  id: string;
  name: string;
  description: string;
  when_to_use: string;
  trigger_conditions: Record<string, string>;
  move_type: 'question' | 'statement' | 'statement+question' | 'rapid_question_sequence' | 'empathy';
  example_lines: string[];
  goal: string;
  transition_to: string;
  /** Hangi metrikleri hangi yönde değiştirmesi beklenir (taktik etkinlik hesabı için) */
  target: { metrics: Array<keyof MetricKeysOnly>; direction: TacticDirection };
}

interface MetricKeysOnly {
  contradiction_score: number;
  avoidance_score: number;
  stress_score: number;
  inconsistency_score: number;
}

export const TACTICS: TacticDefinition[] = [
  {
    id: 'illusion_of_freedom',
    name: 'Özgürlük Yanılsaması',
    description:
      'Şüpheliye tutuklu olmadığını, istediği zaman gidebileceğini söyle. Savunma mekanizmasını indirir.',
    when_to_use: 'Sorgunun açılışında, şüpheli gergin veya savunmacıysa',
    trigger_conditions: { phase: 'opening', stress_score: '>40' },
    move_type: 'statement',
    example_lines: [
      'Burada olmak zorunda değilsin, istediğin an gidebilirsin.',
      'Seninle sadece konuşmak istiyorum, bu resmi bir şey değil.',
    ],
    goal: 'Şüpheliyi rahatlatmak, gardını indirmek',
    transition_to: 'story_locking veya funnel_technique',
    target: { metrics: ['stress_score'], direction: 'down' },
  },
  {
    id: 'story_locking',
    name: 'Hikayeye Sabitleme',
    description:
      'Şüpheliyi mekansal ve görsel detaylara boğ. Anlattığı hikayeyi değiştiremeyeceği hale getir.',
    when_to_use: 'Şüpheli genel bir hikaye anlattı, detaylardan kaçınıyor',
    trigger_conditions: { avoidance_score: '>40', phase: 'early|mid' },
    move_type: 'question',
    example_lines: [
      'Tam olarak neredeydin?',
      'Etrafında ne vardı, ne görüyordun?',
      'Önce ne oldu, sonra ne yaptın?',
      'Yani şunu mu söylüyorsun...',
    ],
    goal: 'Şüpheliyi değiştiremeyeceği bir hikayeye hapsetmek',
    transition_to: 'withholding_evidence veya cognitive_overload',
    target: { metrics: ['inconsistency_score', 'contradiction_score'], direction: 'up' },
  },
  {
    id: 'withholding_evidence',
    name: 'Delilleri Kademeli Sunma',
    description:
      'Elindeki delilleri başta açıklama. Şüphelinin yalanlarına iyice batmasını bekle, sonra köşeye sıkıştırarak sun.',
    when_to_use: 'Şüpheli net bir yalan söyledi ve contradiction_score yükseldi',
    trigger_conditions: { contradiction_score: '>50' },
    move_type: 'statement+question',
    example_lines: [
      'O bölgede bisiklet izi bulduk.',
      'DNA analizi tamamlandı.',
      'Bir tanık o saatte seni gördüğünü söylüyor.',
    ],
    goal: 'Şüpheliyi yalanlarına gömdükten sonra köşeye sıkıştırmak',
    transition_to: 'face_saving_exit veya assumptive_approach',
    target: { metrics: ['contradiction_score'], direction: 'up' },
  },
  {
    id: 'minimization',
    name: 'Minimizasyon',
    description:
      'Suçu küçült ve şüpheliye ahlaki olarak kabul edilebilir bir çerçeve sun.',
    when_to_use: 'Şüpheli duygusallaştı veya vicdan azabı belirtileri var',
    trigger_conditions: { stress_score: '>60', signal: 'duygusallaştı|sesi_titredi' },
    move_type: 'statement',
    example_lines: [
      'Sen kötü biri değilsin. Zor bir durumda ne yapacağını şaşırdın.',
      'Çocuğunu korumak istiyordun, bunu anlıyorum.',
      'Bu bir kaza olmuş olabilir. Bana anlat, ne oldu gerçekten?',
    ],
    goal: 'İtirafı ahlaki açıdan kabul edilebilir hissettirerek kolaylaştırmak',
    transition_to: 'assumptive_approach veya kinesthetic_reenactment',
    target: { metrics: ['stress_score'], direction: 'down' },
  },
  {
    id: 'feigned_sympathy',
    name: 'Sahte Empati ve Ayna Tutma',
    description:
      'Tamamen şüphelinin tarafındaymış gibi davran. Kurbanı kötülemesine katıl, sahte dostluk oluştur.',
    when_to_use: 'Şüpheli kurbanı suçluyor veya haklılaştırma çabasındaysa',
    trigger_conditions: { signal: 'duygusallaştı|kolları_kavuşturdu', phase: 'mid|late' },
    move_type: 'statement',
    example_lines: [
      'Senin yaşadıklarını duyunca gerçekten üzüldüm.',
      'Sana yapılanlar gerçekten haksızlık.',
      'Ben de senin yerinde olsam ne yapacağımı bilemezdim.',
    ],
    goal: 'Şüphelinin gardını tamamen indirmek, güven ilişkisi oluşturmak',
    transition_to: 'assumptive_approach',
    target: { metrics: ['stress_score'], direction: 'down' },
  },
  {
    id: 'assumptive_approach',
    name: 'Suçluluğu Varsayma',
    description:
      "Şüpheliye 'Bunu sen mi yaptın?' diye sorma. Odağı 'Kim yaptı?' dan 'Neden yapmak zorunda kaldın?' a kaydır.",
    when_to_use: 'İtiraf aşamasına yaklaşıldığında, contradiction_score yüksek',
    trigger_conditions: { contradiction_score: '>70', phase: 'late' },
    move_type: 'question',
    example_lines: [
      'Bana sadece o gece ne yapmak zorunda kaldığını anlat.',
      'İkimiz de ne olduğunu biliyoruz. Sana sadece neden olduğunu sormak istiyorum.',
      'Oraya neden gittiğini anlat bana.',
    ],
    goal: "Şüpheliye 'Hayır' deme şansı vermeden itirafı almak",
    transition_to: 'kinesthetic_reenactment',
    target: { metrics: ['contradiction_score'], direction: 'up' },
  },
  {
    id: 'tactical_break',
    name: 'Stratejik Mola',
    description:
      'Şüpheli kırılma noktasına geldiğinde baskıyı artırma. Mola ver, vicdan azabıyla baş başa bırak.',
    when_to_use: 'Şüpheli ağlıyor, çöküyor veya kapanma eşiğine geliyor',
    trigger_conditions: { stress_score: '>80', signal: 'duygusallaştı|titreme' },
    move_type: 'statement',
    example_lines: ['Biraz su içelim, dinlen.', 'Anlıyorum, bu zor. Bir mola verelim.'],
    goal: 'Şüphelinin tamamen kapanmasını önlemek, kendi kendine kırılmasını sağlamak',
    transition_to: 'feigned_sympathy veya minimization',
    target: { metrics: ['stress_score'], direction: 'down' },
  },
  {
    id: 'implied_omniscience',
    name: 'Her Şeyi Biliyormuş İzlenimi',
    description:
      'Polisin aslında her şeyi çözdüğü, sadece boşlukları doldurduğu illüzyonunu yarat.',
    when_to_use: 'Şüpheli ısrarla inkar ediyor ama delil baskısı yüksek',
    trigger_conditions: { contradiction_score: '>60', avoidance_score: '>50' },
    move_type: 'statement',
    example_lines: [
      'Senin bildiğini benim bildiğimi, yakında sen de anlayacaksın.',
      'Bana anlat, yoksa başkalarından duyacaksın.',
      'Zaten çok şey biliyoruz. Sana şans tanımak istiyorum.',
    ],
    goal: 'Şüpheliyi direncin anlamsız olduğuna inandırmak',
    transition_to: 'withholding_evidence',
    target: { metrics: ['avoidance_score', 'contradiction_score'], direction: 'up' },
  },
  {
    id: 'columbo_method',
    name: 'Aptala Yatma',
    description:
      'Bilerek yetersiz veya kafası karışmış gibi davran. Şüpheli daha fazla detay verir.',
    when_to_use: 'Şüpheli kendinden emin, kontrollü ve az konuşuyor',
    trigger_conditions: { avoidance_score: '>30', stress_score: '<40' },
    move_type: 'question',
    example_lines: [
      'Ben görsel bir insanım, tam anlayamadım. Bir daha anlatır mısın?',
      'Kafam karıştı, yani saat kaçtı tam olarak?',
      'Özür dilerim, şunu sormayı unuttum...',
    ],
    goal: 'Şüpheliyi daha fazla konuşturmak, hata yapma payını artırmak',
    transition_to: 'story_locking veya cognitive_overload',
    target: { metrics: ['avoidance_score'], direction: 'down' },
  },
  {
    id: 'cognitive_overload',
    name: 'Bilişsel Aşırı Yükleme',
    description:
      'Birbiriyle alakasız gibi görünen küçük detayları art arda ve hızla sor.',
    when_to_use: 'Şüpheli hikayeye kilitlendi ama tutarsızlık skoru artıyor',
    trigger_conditions: { inconsistency_score: '>40', phase: 'mid' },
    move_type: 'rapid_question_sequence',
    example_lines: [
      'Arabanın rengi neydi?',
      'Tam olarak kaçıncı katta oturuyordu?',
      'O gün ne giyinmiştin?',
      'Hava nasıldı, yağmur var mıydı?',
    ],
    goal: 'Zihinsel yorgunlukla tutarsızlıkları yüzeye çıkarmak',
    transition_to: 'withholding_evidence',
    target: { metrics: ['inconsistency_score'], direction: 'up' },
  },
  {
    id: 'face_saving_exit',
    name: 'Yüz Kurtarıcı Çıkış',
    description:
      'Şüpheliyi köşeye sıkıştırdıktan sonra masumane bir bahane sun.',
    when_to_use: 'Delil sunuldu, şüpheli çıkış yolu arıyor',
    trigger_conditions: { contradiction_score: '>70', signal: 'ani_sakinleşti' },
    move_type: 'statement',
    example_lines: [
      'Orada olman yanlış bir şey yaptığın anlamına gelmiyor.',
      'Belki o gece oradaydın ama bu bir kaza olmuş olabilir.',
      'Sadece orada olduğunu söylesen yeter.',
    ],
    goal: "'Oraya hiç gitmedim' yalanından 'Oradaydım ama...' ya geçişi sağlamak",
    transition_to: 'assumptive_approach',
    target: { metrics: ['contradiction_score'], direction: 'up' },
  },
  {
    id: 'target_derogation',
    name: 'Kurbanı Kötülemeye Çanak Tutma',
    description:
      'Suçlu kurbanı kötüler. Bunu durdurma, aksine onayla.',
    when_to_use: 'Şüpheli kurbanı suçlamaya başladığında',
    trigger_conditions: { phase: 'mid|late', signal: 'duygusallaştı' },
    move_type: 'statement',
    example_lines: [
      'Anlıyorum, sana çok şey yaptı.',
      'Çocuğuna da kötü davranıyormuş, duymak çok zor.',
      'Sen gerçekten çok şeye katlandın.',
    ],
    goal: "'Haklı bir iş yaptığı' hissini körükleyerek itirafı hızlandırmak",
    transition_to: 'minimization veya assumptive_approach',
    target: { metrics: ['stress_score'], direction: 'down' },
  },
  {
    id: 'funnel_technique',
    name: 'Huni Tekniği',
    description:
      'Genel ve zararsız sorularla başla. Şüpheli gevşeyince spesifik kritik sorulara in.',
    when_to_use: 'Sorgunun başında veya yeni konuya geçişte',
    trigger_conditions: { phase: 'opening|mid', stress_score: '<50' },
    move_type: 'question',
    example_lines: [
      'O gün genel olarak ne yaptın?',
      'Akşam kaç gibi eve döndün?',
      'O sırada eve gelince ne yaptın?',
      'Tam olarak saat 22:45 itibariyle neredeydin?',
    ],
    goal: 'Şüpheliyi rahatlatıp kritik anda spesifik soruyla yakalamak',
    transition_to: 'story_locking',
    target: { metrics: ['inconsistency_score'], direction: 'up' },
  },
  {
    id: 'kinesthetic_reenactment',
    name: 'Fiziksel Canlandırma',
    description:
      'Şüpheliden olayı fiziksel olarak canlandırmasını iste. Hafıza ve tutarlılık testi.',
    when_to_use: 'İtiraf eşiğinde, son detayları kilitlemek için',
    trigger_conditions: { contradiction_score: '>75', phase: 'late' },
    move_type: 'question',
    example_lines: [
      'Bana göster, tam olarak nasıl tuttun onu?',
      'Hangi elinle? Şuradan mı yaklaştın?',
      'Bir daha göster, o anda neredeydin?',
    ],
    goal: 'Detay tutarlılığını kalıcı hale getirmek, itirafı somutlaştırmak',
    transition_to: 'assumptive_approach',
    target: { metrics: ['contradiction_score', 'inconsistency_score'], direction: 'up' },
  },
  // 15. TAKTİK — KARARIMIZ GEREĞİ EKLENDİ
  {
    id: 'exploit_weakness',
    name: 'Kırılma Noktasını Sömürme',
    description:
      'Şüpheli sinyal kombinasyonuyla anlık kırılma gösteriyor. O spesifik cevabın üzerine git, bırakma, derinleştir.',
    when_to_use:
      'Yüksek stres sinyali + bilgi gizleme refleksi (örn. dudak ısırma + sesi titredi) tespit edildiğinde',
    trigger_conditions: { signal: 'dudak_ısırma+sesi_titredi', stress_score: '>65' },
    move_type: 'question',
    example_lines: [
      'Az önce söylediğin şeyi biraz daha açar mısın?',
      'O noktada tam olarak ne hissediyordun, ne oldu?',
      'Şu son cümlenin üzerine biraz duralım — orada ne oldu?',
    ],
    goal: 'Anlık kırılma fırsatını değerlendirerek bilgi sızdırmak',
    transition_to: 'withholding_evidence veya assumptive_approach',
    target: { metrics: ['contradiction_score', 'stress_score'], direction: 'up' },
  },
];

export const TACTIC_MAP: Record<string, TacticDefinition> = Object.fromEntries(
  TACTICS.map((t) => [t.id, t]),
);

export function getTactic(id: string): TacticDefinition | null {
  return TACTIC_MAP[id] ?? null;
}

/**
 * Strateji prompt'una verilecek özet (büyük kataloğun küçültülmüş hali).
 */
export function tacticSummariesForPrompt(): Array<{
  id: string;
  name: string;
  when_to_use: string;
  goal: string;
  move_type: string;
}> {
  return TACTICS.map((t) => ({
    id: t.id,
    name: t.name,
    when_to_use: t.when_to_use,
    goal: t.goal,
    move_type: t.move_type,
  }));
}

/**
 * Hamle prompt'una verilecek "taktik prensipleri" — örnek satırlar dahil
 * (model satırı kopyalamasın, prensibi anlasın diye).
 */
export function tacticPrincipleForPrompt(id: string): TacticDefinition | null {
  return TACTIC_MAP[id] ?? null;
}
