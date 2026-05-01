// =====================================================================
// Edge Function paylaşımlı: 15 taktik kataloğu
// (lib/tactics.ts ile birebir aynı içerik — Deno run-time için ayrı dosya)
// =====================================================================

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
  target: { metrics: string[]; direction: 'up' | 'down' };
}

export const TACTICS: TacticDefinition[] = [
  {
    id: 'illusion_of_freedom',
    name: 'Özgürlük Yanılsaması',
    description: 'Şüpheliye tutuklu olmadığını söyleyerek savunma mekanizmasını indir.',
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
    description: 'Şüpheliyi mekansal/görsel detaylara boğ, hikayeyi değiştiremez hale getir.',
    when_to_use: 'Şüpheli genel bir hikaye anlattı, detaylardan kaçınıyor',
    trigger_conditions: { avoidance_score: '>40', phase: 'early|mid' },
    move_type: 'question',
    example_lines: [
      'Tam olarak neredeydin?',
      'Etrafında ne vardı?',
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
    description: 'Delilleri başta açıklama; yalanlarına battıktan sonra sun.',
    when_to_use: 'Şüpheli net yalan söyledi, contradiction_score yükseldi',
    trigger_conditions: { contradiction_score: '>50' },
    move_type: 'statement+question',
    example_lines: [
      'O bölgede bisiklet izi bulduk.',
      'DNA analizi tamamlandı.',
      'Bir tanık o saatte seni gördüğünü söylüyor.',
    ],
    goal: 'Şüpheliyi köşeye sıkıştırmak',
    transition_to: 'face_saving_exit veya assumptive_approach',
    target: { metrics: ['contradiction_score'], direction: 'up' },
  },
  {
    id: 'minimization',
    name: 'Minimizasyon',
    description: 'Suçu küçült, ahlaki olarak kabul edilebilir bir çerçeve sun.',
    when_to_use: 'Şüpheli duygusallaştı veya vicdan azabı belirtileri var',
    trigger_conditions: { stress_score: '>60', signal: 'duygusallaştı|sesi_titredi' },
    move_type: 'statement',
    example_lines: [
      'Sen kötü biri değilsin. Zor bir durumda ne yapacağını şaşırdın.',
      'Bu bir kaza olmuş olabilir.',
    ],
    goal: 'İtirafı ahlaki olarak kabul edilebilir hissettirmek',
    transition_to: 'assumptive_approach veya kinesthetic_reenactment',
    target: { metrics: ['stress_score'], direction: 'down' },
  },
  {
    id: 'feigned_sympathy',
    name: 'Sahte Empati ve Ayna Tutma',
    description: 'Tamamen şüphelinin tarafındaymış gibi davran, sahte dostluk oluştur.',
    when_to_use: 'Şüpheli savunmaya çekildi veya kurbanı suçluyor',
    trigger_conditions: { signal: 'duygusallaştı|kolları_kavuşturdu', phase: 'mid|late' },
    move_type: 'statement',
    example_lines: [
      'Senin yaşadıklarını duyunca üzüldüm.',
      'Sana yapılanlar haksızlık.',
      'Ben de senin yerinde olsam ne yapardım bilmem.',
    ],
    goal: 'Şüphelinin gardını indirmek, güven oluşturmak',
    transition_to: 'assumptive_approach',
    target: { metrics: ['stress_score'], direction: 'down' },
  },
  {
    id: 'assumptive_approach',
    name: 'Suçluluğu Varsayma',
    description: "'Sen mi yaptın?' yerine 'Neden yapmak zorunda kaldın?' formu.",
    when_to_use: 'İtiraf aşamasına yaklaşıldığında',
    trigger_conditions: { contradiction_score: '>70', phase: 'late' },
    move_type: 'question',
    example_lines: [
      'Bana sadece ne yapmak zorunda kaldığını anlat.',
      'İkimiz de ne olduğunu biliyoruz. Sana sadece neden olduğunu sormak istiyorum.',
    ],
    goal: "Şüpheliye 'Hayır' deme şansı vermeden itirafı almak",
    transition_to: 'kinesthetic_reenactment',
    target: { metrics: ['contradiction_score'], direction: 'up' },
  },
  {
    id: 'tactical_break',
    name: 'Stratejik Mola',
    description: 'Şüpheli kırılma noktasındayken baskıyı artırma; mola ver.',
    when_to_use: 'Şüpheli ağlıyor veya kapanma eşiğinde',
    trigger_conditions: { stress_score: '>80', signal: 'duygusallaştı|titreme' },
    move_type: 'statement',
    example_lines: ['Biraz su içelim, dinlen.', 'Anlıyorum, bu zor. Bir mola verelim.'],
    goal: 'Şüphelinin tamamen kapanmasını önlemek',
    transition_to: 'feigned_sympathy veya minimization',
    target: { metrics: ['stress_score'], direction: 'down' },
  },
  {
    id: 'implied_omniscience',
    name: 'Her Şeyi Biliyormuş İzlenimi',
    description: 'Polisin her şeyi çözdüğü, sadece boşlukları doldurduğu illüzyonu.',
    when_to_use: 'Şüpheli ısrarla inkar ediyor ama delil baskısı yüksek',
    trigger_conditions: { contradiction_score: '>60', avoidance_score: '>50' },
    move_type: 'statement',
    example_lines: [
      'Senin bildiğini benim bildiğimi yakında anlayacaksın.',
      'Bana anlat, yoksa başkalarından duyacaksın.',
    ],
    goal: 'Direncin anlamsız olduğuna inandırmak',
    transition_to: 'withholding_evidence',
    target: { metrics: ['avoidance_score', 'contradiction_score'], direction: 'up' },
  },
  {
    id: 'columbo_method',
    name: 'Aptala Yatma',
    description: 'Bilerek yetersiz görün; şüpheli daha fazla detay versin.',
    when_to_use: 'Şüpheli kendinden emin, kontrollü ve az konuşuyor',
    trigger_conditions: { avoidance_score: '>30', stress_score: '<40' },
    move_type: 'question',
    example_lines: [
      'Tam anlayamadım, bir daha anlatır mısın?',
      'Kafam karıştı, saat kaçtı tam olarak?',
    ],
    goal: 'Şüpheliyi konuşturmak, hata yapma payını artırmak',
    transition_to: 'story_locking veya cognitive_overload',
    target: { metrics: ['avoidance_score'], direction: 'down' },
  },
  {
    id: 'cognitive_overload',
    name: 'Bilişsel Aşırı Yükleme',
    description: 'Alakasız küçük detayları hızla art arda sor.',
    when_to_use: 'Hikaye kilitli ama tutarsızlık skoru artıyor',
    trigger_conditions: { inconsistency_score: '>40', phase: 'mid' },
    move_type: 'rapid_question_sequence',
    example_lines: [
      'Arabanın rengi neydi?',
      'Tam olarak kaçıncı katta oturuyordu?',
      'O gün ne giyinmiştin?',
    ],
    goal: 'Zihinsel yorgunlukla tutarsızlıkları yüzeye çıkarmak',
    transition_to: 'withholding_evidence',
    target: { metrics: ['inconsistency_score'], direction: 'up' },
  },
  {
    id: 'face_saving_exit',
    name: 'Yüz Kurtarıcı Çıkış',
    description: 'Köşeye sıkışmış şüpheliye masumane bir bahane sun.',
    when_to_use: 'Delil sunuldu, çıkış yolu arıyor',
    trigger_conditions: { contradiction_score: '>70', signal: 'ani_sakinleşti' },
    move_type: 'statement',
    example_lines: [
      'Orada olman yanlış bir şey yaptığın anlamına gelmiyor.',
      'Belki o gece oradaydın ama bu bir kaza olmuş olabilir.',
    ],
    goal: "'Oraya hiç gitmedim' yalanından 'Oradaydım ama...' ya geçiş",
    transition_to: 'assumptive_approach',
    target: { metrics: ['contradiction_score'], direction: 'up' },
  },
  {
    id: 'target_derogation',
    name: 'Kurbanı Kötülemeye Çanak Tutma',
    description: 'Şüpheli kurbanı kötülerken durdurmadan onayla.',
    when_to_use: 'Şüpheli kurbanı suçlamaya başladığında',
    trigger_conditions: { phase: 'mid|late', signal: 'duygusallaştı' },
    move_type: 'statement',
    example_lines: [
      'Anlıyorum, sana çok şey yaptı.',
      'Sen gerçekten çok şeye katlandın.',
    ],
    goal: "'Haklı bir iş yaptığı' hissini körüklemek",
    transition_to: 'minimization veya assumptive_approach',
    target: { metrics: ['stress_score'], direction: 'down' },
  },
  {
    id: 'funnel_technique',
    name: 'Huni Tekniği',
    description: 'Genel/zararsız sorularla başla; sonra spesifik kritik sorulara in.',
    when_to_use: 'Sorgunun başında veya yeni konuya geçişte',
    trigger_conditions: { phase: 'opening|mid', stress_score: '<50' },
    move_type: 'question',
    example_lines: [
      'O gün genel olarak ne yaptın?',
      'Akşam kaç gibi eve döndün?',
      'Tam olarak saat 22:45 itibariyle neredeydin?',
    ],
    goal: 'Rahatlatıp kritik anda spesifik soruyla yakalamak',
    transition_to: 'story_locking',
    target: { metrics: ['inconsistency_score'], direction: 'up' },
  },
  {
    id: 'kinesthetic_reenactment',
    name: 'Fiziksel Canlandırma',
    description: 'Olayı fiziksel olarak canlandırmasını iste.',
    when_to_use: 'İtiraf eşiğinde, son detayları kilitlemek',
    trigger_conditions: { contradiction_score: '>75', phase: 'late' },
    move_type: 'question',
    example_lines: [
      'Bana göster, tam olarak nasıl tuttun onu?',
      'Hangi elinle? Şuradan mı yaklaştın?',
    ],
    goal: 'Detay tutarlılığını kalıcı hale getirmek',
    transition_to: 'assumptive_approach',
    target: { metrics: ['contradiction_score', 'inconsistency_score'], direction: 'up' },
  },
  // 15. taktik
  {
    id: 'exploit_weakness',
    name: 'Kırılma Noktasını Sömürme',
    description: 'Sinyal kombinasyonuyla kırılma anı yakalandığında o cevabın üzerine git.',
    when_to_use: 'Yüksek stres + bilgi gizleme refleksi tespit edildiğinde',
    trigger_conditions: { signal: 'dudak_ısırma+sesi_titredi', stress_score: '>65' },
    move_type: 'question',
    example_lines: [
      'Az önce söylediğin şeyi biraz daha açar mısın?',
      'O noktada tam olarak ne hissediyordun?',
      'Şu son cümlenin üzerine biraz duralım — orada ne oldu?',
    ],
    goal: 'Anlık kırılma fırsatını bilgi sızıntısına çevirmek',
    transition_to: 'withholding_evidence veya assumptive_approach',
    target: { metrics: ['contradiction_score', 'stress_score'], direction: 'up' },
  },
];

export const TACTIC_MAP: Record<string, TacticDefinition> = Object.fromEntries(
  TACTICS.map((t) => [t.id, t]),
);

export function tacticSummariesForPrompt() {
  return TACTICS.map((t) => ({
    id: t.id,
    name: t.name,
    when_to_use: t.when_to_use,
    goal: t.goal,
    move_type: t.move_type,
  }));
}
