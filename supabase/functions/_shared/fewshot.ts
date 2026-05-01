// =====================================================================
// Few-shot örnekleri — Castellano + Ormsby vakalarından kritik anlar.
// Model satırı kopyalamasın, prensibi öğrensin.
// =====================================================================

export interface FewShotExample {
  case: 'castellano' | 'ormsby';
  context: string;
  metrics_state: string;
  detective_move: string;
  tactic_principle: string;
}

export const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    case: 'castellano',
    context:
      'Şüpheli (Mark) eski sevgilisini öldürdüğünü inkar ediyor; oğlundan bahsederken duygusallaşıyor.',
    metrics_state: 'stress yüksek, contradiction orta, signal: duygusallaştı + sesi_titredi',
    detective_move:
      "'Sen kötü bir baba değilsin. Oğlunu korumaya çalışıyordun, biliyorum. Bana sadece o gece ne yapmak zorunda kaldığını anlat.'",
    tactic_principle:
      'minimization: vicdan azabı belirgin → suçun ahlaki çerçevesini hafifleterek itirafı kolaylaştır.',
  },
  {
    case: 'ormsby',
    context:
      'Şüpheli (Thane) kurbanların evine gittiğini inkar ediyor; bira şişesindeki DNA henüz açıklanmadı.',
    metrics_state: 'avoidance yüksek, contradiction yükseliyor, signal: kolları_kavuşturdu',
    detective_move:
      "'Kafam karıştı, yardım et bana. Bisiklet şuradan mı geçti, yoksa ana yoldan mı? O gün hava nasıldı?'",
    tactic_principle:
      'columbo_method: şüpheli kontrollü, baskı işe yaramıyor → aptala yatarak detay konuşturma.',
  },
  {
    case: 'ormsby',
    context:
      'Detay tuzakları işliyor; şüpheli zaman ve yer detaylarında çelişkili veriler vermeye başladı.',
    metrics_state: 'contradiction yüksek, inconsistency yüksek',
    detective_move:
      "'Bira şişesinde senin DNA'n var. Ev sahibi seni Salı akşamı orada gördüğünü hatırlıyor. Bisiklet izi de bunu doğruluyor. Şu an tek anlamadığım, oraya neden gittiğin.'",
    tactic_principle:
      'withholding_evidence + assumptive_approach kombinasyonu: yalanlara battıktan sonra delil sun ve odağı "neden" sorusuna kaydır.',
  },
  {
    case: 'castellano',
    context:
      'Şüpheli ifade verirken aniden sakinleşti, cevapları kısalttı.',
    metrics_state: 'signal: ani_sakinleşti + eller_masada_sabit',
    detective_move:
      "'Bana o akşam saat tam olarak kaçta evden çıktığını ve hangi yoldan gittiğini sırasıyla anlat. Önce sokak adıyla başla.'",
    tactic_principle:
      'story_locking: hazırlanmış sakinlik → spesifik mekansal/kronolojik detay sorularıyla hikayeyi sabitle.',
  },
  {
    case: 'ormsby',
    context:
      'Şüpheli inkarda ısrarlı, dedektif birden ona bağırıyormuş gibi davranmaktan vazgeçti.',
    metrics_state: 'contradiction yüksek, avoidance yüksek',
    detective_move:
      "'Biz zaten her şeyi biliyoruz, Thane. Sana sadece kendi versiyonunu söyleme şansı tanıyorum.'",
    tactic_principle:
      'implied_omniscience: direnci anlamsız hissettir, fakat blöfü vakaya özel ve inanılır tut.',
  },
];

export function formatFewShotForPrompt(): string {
  return FEW_SHOT_EXAMPLES.map((ex, i) =>
    [
      `--- ÖRNEK ${i + 1} (${ex.case}) ---`,
      `Bağlam: ${ex.context}`,
      `Metrik durumu: ${ex.metrics_state}`,
      `Dedektif hamlesi: ${ex.detective_move}`,
      `Prensip: ${ex.tactic_principle}`,
    ].join('\n'),
  ).join('\n\n');
}
