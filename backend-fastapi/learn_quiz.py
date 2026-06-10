"""
사주 학습 모드 — 퀴즈 동적 생성 모듈
- saju_utils의 매핑 테이블(오행·십성·12운성·지장간·형충회합 등)을 출제 근거로 사용
- 챕터별 출제 함수가 문제 풀을 만들고, seed 기반 셔플로 N문항을 샘플링한다
- 문항 형식: {key, question, choices[4], answer(정답 인덱스), explanation}
"""
import random
from typing import Any, Callable

from saju_utils import (
    HEAVENLY_STEMS, EARTHLY_BRANCHES, GANZHI_LIST, ELEMENTS_MAP,
    GAN_TEN_GODS, BRANCH_HIDDEN_GANS, BRANCH_HIDDEN_FULL, TWELVE_GROWTH,
    STEM_RELATIONS, BRANCH_RELATIONS, get_sinsal_list, get_gongmang,
)

# ---------------------------------------------------------------------------
# 학습용 메타데이터 (한글 독음·음양·물상·띠·계절·시각)
# ---------------------------------------------------------------------------
STEM_KOR = {'甲': '갑', '乙': '을', '丙': '병', '丁': '정', '戊': '무',
            '己': '기', '庚': '경', '辛': '신', '壬': '임', '癸': '계'}
BRANCH_KOR = {'子': '자', '丑': '축', '寅': '인', '卯': '묘', '辰': '진', '巳': '사',
              '午': '오', '未': '미', '申': '신', '酉': '유', '戌': '술', '亥': '해'}
YANG_STEMS = ['甲', '丙', '戊', '庚', '壬']
YANG_BRANCHES = ['子', '寅', '辰', '午', '申', '戌']
STEM_IMAGERY = {'甲': '큰 나무', '乙': '화초·덩굴', '丙': '태양', '丁': '촛불·달빛', '戊': '큰 산·대지',
                '己': '밭·정원', '庚': '바위·무쇠', '辛': '보석·칼날', '壬': '바다·큰 강', '癸': '비·이슬'}
BRANCH_ANIMAL = {'子': '쥐', '丑': '소', '寅': '호랑이', '卯': '토끼', '辰': '용', '巳': '뱀',
                 '午': '말', '未': '양', '申': '원숭이', '酉': '닭', '戌': '개', '亥': '돼지'}
BRANCH_TIME = {'子': '23~01시', '丑': '01~03시', '寅': '03~05시', '卯': '05~07시',
               '辰': '07~09시', '巳': '09~11시', '午': '11~13시', '未': '13~15시',
               '申': '15~17시', '酉': '17~19시', '戌': '19~21시', '亥': '21~23시'}
BRANCH_SEASON = {'寅': '봄', '卯': '봄', '辰': '봄(환절기)', '巳': '여름', '午': '여름', '未': '여름(환절기)',
                 '申': '가을', '酉': '가을', '戌': '가을(환절기)', '亥': '겨울', '子': '겨울', '丑': '겨울(환절기)'}
ELEMENTS = ['목', '화', '토', '금', '수']
# 상생: A가 B를 낳는다 / 상극: A가 B를 누른다
GENERATES = {'목': '화', '화': '토', '토': '금', '금': '수', '수': '목'}
CONTROLS = {'목': '토', '토': '수', '수': '화', '화': '금', '금': '목'}
# 오행별 속성 (계절·방위·색·운동성) — 1장 개념 카드와 1:1 대응
ELEMENT_META = {
    '목': {'season': '봄', 'direction': '동쪽', 'color': '청색(파랑)', 'nature': '위로 뻗는 성장'},
    '화': {'season': '여름', 'direction': '남쪽', 'color': '적색(빨강)', 'nature': '사방으로 퍼지는 확산'},
    '토': {'season': '환절기(사계의 사이)', 'direction': '중앙', 'color': '황색(노랑)', 'nature': '중심을 잡는 중재'},
    '금': {'season': '가을', 'direction': '서쪽', 'color': '백색(하양)', 'nature': '단단히 여무는 수렴'},
    '수': {'season': '겨울', 'direction': '북쪽', 'color': '흑색(검정)', 'nature': '아래로 모이는 응축'},
}
TRIADS = {'寅午戌': '화국(火局)', '申子辰': '수국(水局)', '巳酉丑': '금국(金局)', '亥卯未': '목국(木局)'}
SINSAL_ORDER = ['지살', '년살', '월살', '망신살', '장성살', '반안살', '역마살', '육해살', '화개살', '겁살', '재살', '천살']


def _label_stem(s: str) -> str:
    return f"{s}({STEM_KOR[s]})"


def _label_branch(b: str) -> str:
    return f"{b}({BRANCH_KOR[b]})"


def _label_ganzhi(gz: str) -> str:
    return f"{gz}({STEM_KOR[gz[0]]}{BRANCH_KOR[gz[1]]})"


def _make_item(rng: random.Random, key: str, question: str, answer: str,
               wrong_pool: list[str], explanation: str) -> dict[str, Any]:
    """정답 + 오답 3개(같은 카테고리 풀)로 4지선다 문항을 조립한다."""
    wrongs = [w for w in dict.fromkeys(wrong_pool) if w != answer]
    rng.shuffle(wrongs)
    choices = wrongs[:3] + [answer]
    rng.shuffle(choices)
    return {
        "key": key,
        "question": question,
        "choices": choices,
        "answer": choices.index(answer),
        "explanation": explanation,
    }


# ---------------------------------------------------------------------------
# 챕터별 문제 풀 생성기
# ---------------------------------------------------------------------------
def _pool_elements(rng: random.Random) -> list[dict]:
    # 주의: 천간·지지 글자의 오행 판별 문제는 2~3장(천간·지지)에서 출제한다.
    # 1장 퀴즈는 1장 개념 카드에서 배운 범위(오행 성질·계절·방위·색·상생·상극)만 다룬다.
    items = []
    # 오행 속성 (계절·방위·색·운동성)
    for el, meta in ELEMENT_META.items():
        items.append(_make_item(
            rng, f"elseason:{el}", f"오행 {el}의 계절은?", meta['season'],
            [m['season'] for m in ELEMENT_META.values()],
            f"{el}은(는) {meta['season']}의 기운입니다. ({meta['nature']})"))
        items.append(_make_item(
            rng, f"elseason_r:{el}", f"'{meta['season']}'에 해당하는 오행은?", el, ELEMENTS,
            f"{meta['season']}의 오행은 {el}입니다."))
        items.append(_make_item(
            rng, f"eldir:{el}", f"오행 {el}의 방위는?", meta['direction'],
            [m['direction'] for m in ELEMENT_META.values()],
            f"{el}의 방위는 {meta['direction']}, 색은 {meta['color']}입니다."))
        items.append(_make_item(
            rng, f"elcolor:{el}", f"오행 {el}을 상징하는 색은?", meta['color'],
            [m['color'] for m in ELEMENT_META.values()],
            f"{el}의 상징색은 {meta['color']}입니다."))
        items.append(_make_item(
            rng, f"elnature:{el}", f"'{meta['nature']}'의 기운을 가진 오행은?", el, ELEMENTS,
            f"{el}의 운동성이 '{meta['nature']}'입니다."))
    # 상생
    for a, b in GENERATES.items():
        items.append(_make_item(
            rng, f"gen:{a}", f"오행 {a}이(가) 생(生)하는 오행은?", b, ELEMENTS,
            f"상생 순환은 목→화→토→금→수→목입니다. {a}은(는) {b}을(를) 낳습니다."))
        items.append(_make_item(
            rng, f"genby:{b}", f"{b}을(를) 생(生)해 주는 오행은?", a, ELEMENTS,
            f"상생 순환(목→화→토→금→수)에서 {b}을(를) 낳는 것은 {a}입니다."))
    # 상극
    for a, b in CONTROLS.items():
        items.append(_make_item(
            rng, f"ctl:{a}", f"{a}이 극(剋)하는 오행은?", b, ELEMENTS,
            f"상극 순환은 목→토→수→화→금→목입니다. {a}은(는) {b}을(를) 누릅니다."))
    return items


def _pool_stems(rng: random.Random) -> list[dict]:
    items = []
    stem_labels = [_label_stem(s) for s in HEAVENLY_STEMS]
    for s in HEAVENLY_STEMS:
        kor, el = STEM_KOR[s], ELEMENTS_MAP[s]
        yy = '양' if s in YANG_STEMS else '음'
        # 독음
        items.append(_make_item(
            rng, f"stemkor:{s}", f"천간 {s}의 한글 독음은?", kor, list(STEM_KOR.values()),
            f"{s}은(는) '{kor}'으로 읽습니다. ({yy}{el})"))
        # 음양+오행
        items.append(_make_item(
            rng, f"stemyy:{s}", f"{_label_stem(s)}의 음양과 오행은?", f"{yy}{el}",
            [f"{a}{b}" for a in ['양', '음'] for b in ELEMENTS],
            f"{_label_stem(s)}은(는) {yy}의 {el} 기운입니다. 물상은 {STEM_IMAGERY[s]}."))
        # 물상
        items.append(_make_item(
            rng, f"stemimg:{s}", f"'{STEM_IMAGERY[s]}'에 비유되는 천간은?", _label_stem(s), stem_labels,
            f"{_label_stem(s)}의 대표 물상이 {STEM_IMAGERY[s]}입니다."))
    return items


def _pool_branches(rng: random.Random) -> list[dict]:
    items = []
    branch_labels = [_label_branch(b) for b in EARTHLY_BRANCHES]
    for b in EARTHLY_BRANCHES:
        el = ELEMENTS_MAP[b]
        yy = '양' if b in YANG_BRANCHES else '음'
        items.append(_make_item(
            rng, f"brani:{b}", f"{_label_branch(b)}에 해당하는 띠 동물은?", BRANCH_ANIMAL[b],
            list(BRANCH_ANIMAL.values()),
            f"{_label_branch(b)}은(는) {BRANCH_ANIMAL[b]}띠입니다."))
        items.append(_make_item(
            rng, f"brel:{b}", f"{_label_branch(b)}의 오행은?", el, ELEMENTS,
            f"{_label_branch(b)}은(는) {BRANCH_SEASON[b]}의 글자로 오행은 {el}입니다."))
        items.append(_make_item(
            rng, f"brtime:{b}", f"{_label_branch(b)}시(時)는 몇 시인가?", BRANCH_TIME[b],
            list(BRANCH_TIME.values()),
            f"{_label_branch(b)}시는 {BRANCH_TIME[b]}입니다."))
        items.append(_make_item(
            rng, f"brseason:{b}", f"{_label_branch(b)}의 계절은?", BRANCH_SEASON[b],
            list(dict.fromkeys(BRANCH_SEASON.values())),
            f"인묘진=봄, 사오미=여름, 신유술=가을, 해자축=겨울. {_label_branch(b)}은(는) {BRANCH_SEASON[b]}입니다."))
        items.append(_make_item(
            rng, f"bryy:{b}", f"{_label_branch(b)}의 음양은?", yy, ['양', '음', '중성', '없음'],
            f"양지는 자인진오신술, 음지는 축묘사미유해입니다. {_label_branch(b)}은(는) {yy}입니다."))
    return items


def _pool_ganzhi(rng: random.Random) -> list[dict]:
    items = []
    sample_idx = rng.sample(range(60), 20)
    for i in sample_idx:
        gz, nxt = GANZHI_LIST[i], GANZHI_LIST[(i + 1) % 60]
        near = [_label_ganzhi(GANZHI_LIST[(i + d) % 60]) for d in (2, 11, 13, -1, 10)]
        items.append(_make_item(
            rng, f"gznext:{gz}", f"60갑자에서 {_label_ganzhi(gz)} 다음 간지는?", _label_ganzhi(nxt), near,
            f"60갑자는 천간·지지가 한 칸씩 함께 전진합니다. {_label_ganzhi(gz)} 다음은 {_label_ganzhi(nxt)}입니다."))
        # 간지의 오행 조합
        s_el, b_el = ELEMENTS_MAP[gz[0]], ELEMENTS_MAP[gz[1]]
        combo = f"{s_el}+{b_el}"
        items.append(_make_item(
            rng, f"gzel:{gz}", f"{_label_ganzhi(gz)}의 오행 조합(천간+지지)은?", combo,
            [f"{a}+{b}" for a in ELEMENTS for b in ELEMENTS],
            f"{_label_stem(gz[0])}은 {s_el}, {_label_branch(gz[1])}은 {b_el}이므로 {combo}입니다."))
    # 근묘화실
    pillar_q = [
        ("사주에서 '나 자신'을 나타내는 기둥은?", "일주(日柱)", "일주의 천간(일간)이 사주의 주인공입니다."),
        ("부모·사회성·성장기를 나타내는 기둥은?", "월주(月柱)", "근묘화실에서 월주는 싹(苗) — 부모 자리이자 사회 무대입니다."),
        ("조상·어린 시절을 나타내는 기둥은?", "연주(年柱)", "연주는 뿌리(根) — 조상과 유년기를 봅니다."),
        ("자녀·말년을 나타내는 기둥은?", "시주(時柱)", "시주는 열매(實) — 자녀와 말년을 봅니다."),
    ]
    pillar_pool = ["연주(年柱)", "월주(月柱)", "일주(日柱)", "시주(時柱)"]
    for i, (q, a, ex) in enumerate(pillar_q):
        items.append(_make_item(rng, f"pillar:{i}", q, a, pillar_pool, ex))
    return items


def _pool_jijanggan(rng: random.Random) -> list[dict]:
    items = []
    stem_labels = [_label_stem(s) for s in HEAVENLY_STEMS]
    for b in EARTHLY_BRANCHES:
        main = BRANCH_HIDDEN_GANS[b]
        full = "·".join(g for g, _ in BRANCH_HIDDEN_FULL[b])
        items.append(_make_item(
            rng, f"jjg:{b}", f"{_label_branch(b)}의 지장간 정기(본기)는?", _label_stem(main), stem_labels,
            f"{_label_branch(b)}의 지장간은 {full}이며, 대표(정기)는 {_label_stem(main)}입니다."))
        all_combos = ["·".join(g for g, _ in BRANCH_HIDDEN_FULL[x]) for x in EARTHLY_BRANCHES]
        items.append(_make_item(
            rng, f"jjgfull:{b}", f"{_label_branch(b)} 속에 숨은 지장간 전체 구성은?", full, all_combos,
            f"{_label_branch(b)}의 지장간은 {full}(맨 뒤가 정기)입니다."))
    return items


def _pool_sipseong(rng: random.Random) -> list[dict]:
    items = []
    ten_gods = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인']
    day_gans = rng.sample(HEAVENLY_STEMS, 6)
    for dg in day_gans:
        targets = rng.sample(HEAVENLY_STEMS, 5)
        for t in targets:
            tg = GAN_TEN_GODS[dg][t]
            items.append(_make_item(
                rng, f"ss:{dg}{t}", f"일간이 {_label_stem(dg)}일 때, {_label_stem(t)}의 십성은?",
                tg, ten_gods,
                f"일간 {_label_stem(dg)}({ELEMENTS_MAP[dg]}) 기준으로 {_label_stem(t)}({ELEMENTS_MAP[t]})은(는) {tg}입니다."))
    # 개념 문제
    concept_q = [
        ("나와 오행이 같고 음양도 같은 십성은?", "비견", "같은 오행: 음양 같으면 비견, 다르면 겁재."),
        ("내가 생(生)하는 오행 중 음양이 다른 십성은?", "상관", "내가 생함: 음양 같으면 식신, 다르면 상관."),
        ("내가 극(剋)하는 오행 중 음양이 다른 십성은?", "정재", "내가 극함(재성): 음양 같으면 편재, 다르면 정재."),
        ("나를 극(剋)하는 오행 중 음양이 같은 십성은?", "편관", "나를 극함(관성): 음양 같으면 편관(칠살), 다르면 정관."),
        ("나를 생(生)해 주는 오행 중 음양이 다른 십성은?", "정인", "나를 생함(인성): 음양 같으면 편인, 다르면 정인."),
    ]
    for i, (q, a, ex) in enumerate(concept_q):
        items.append(_make_item(rng, f"ssc:{i}", q, a, ten_gods, ex))
    return items


def _pool_unseong(rng: random.Random) -> list[dict]:
    items = []
    stages = ['장생', '목욕', '관대', '건록', '제왕', '쇠', '병', '사', '묘', '절', '태', '양']
    day_gans = rng.sample(list(TWELVE_GROWTH.keys()), 6)
    for dg in day_gans:
        branches = rng.sample(EARTHLY_BRANCHES, 4)
        for b in branches:
            st = TWELVE_GROWTH[dg][b]
            direction = '순행' if dg in YANG_STEMS else '역행'
            items.append(_make_item(
                rng, f"us:{dg}{b}", f"{_label_stem(dg)} 일간이 {_label_branch(b)}를 만나면 12운성은?",
                st, stages,
                f"{_label_stem(dg)}은(는) {'양간' if dg in YANG_STEMS else '음간'}이라 {direction}합니다. {_label_branch(b)}에서 {st}입니다."))
    # 순서 문제
    for i in rng.sample(range(12), 4):
        cur, nxt = stages[i], stages[(i + 1) % 12]
        items.append(_make_item(
            rng, f"usord:{cur}", f"12운성에서 '{cur}' 다음 단계는?", nxt, stages,
            f"12운성 순서: 장생→목욕→관대→건록→제왕→쇠→병→사→묘→절→태→양. {cur} 다음은 {nxt}입니다."))
    return items


def _pool_hapchung(rng: random.Random) -> list[dict]:
    items = []
    stem_labels = [_label_stem(s) for s in HEAVENLY_STEMS]
    branch_labels = [_label_branch(b) for b in EARTHLY_BRANCHES]
    # 천간합/충
    for s in HEAVENLY_STEMS:
        partner = STEM_RELATIONS['합'][s]
        items.append(_make_item(
            rng, f"sh:{s}", f"{_label_stem(s)}과(와) 천간합(合)을 이루는 글자는?", _label_stem(partner), stem_labels,
            f"천간합 다섯 쌍: 갑기·을경·병신·정임·무계. {_label_stem(s)}의 짝은 {_label_stem(partner)}입니다."))
    for s, partner in STEM_RELATIONS['충'].items():
        items.append(_make_item(
            rng, f"sc:{s}", f"{_label_stem(s)}과(와) 천간충(沖)이 되는 글자는?", _label_stem(partner), stem_labels,
            f"천간충: 갑경·을신·병임·정계 (무·기 토는 충이 없음). {_label_stem(s)}의 충은 {_label_stem(partner)}입니다."))
    # 지지 육합/육충
    for b in EARTHLY_BRANCHES:
        hap, chung = BRANCH_RELATIONS['합'][b], BRANCH_RELATIONS['충'][b]
        items.append(_make_item(
            rng, f"bh:{b}", f"{_label_branch(b)}과(와) 육합(六合)을 이루는 지지는?", _label_branch(hap), branch_labels,
            f"육합: 자축·인해·묘술·진유·사신·오미. {_label_branch(b)}의 합은 {_label_branch(hap)}입니다."))
        items.append(_make_item(
            rng, f"bc:{b}", f"{_label_branch(b)}과(와) 육충(六沖)이 되는 지지는?", _label_branch(chung), branch_labels,
            f"육충은 지지 시계판의 정반대 자리입니다. {_label_branch(b)}의 충은 {_label_branch(chung)}입니다."))
    # 삼합
    for group, name in TRIADS.items():
        g_label = "·".join(_label_branch(x) for x in group)
        items.append(_make_item(
            rng, f"triad:{group}", f"삼합 {g_label}이 이루는 국(局)은?", name, list(TRIADS.values()),
            f"{g_label} 세 글자가 모이면 {name}을 이룹니다."))
    return items


def _pool_sinsal(rng: random.Random) -> list[dict]:
    items = []
    # 12신살: 연지 기준 산출
    refs = rng.sample(EARTHLY_BRANCHES, 5)
    for ref in refs:
        targets = rng.sample(EARTHLY_BRANCHES, 3)
        for t in targets:
            ss = get_sinsal_list(ref, t)
            items.append(_make_item(
                rng, f"sin:{ref}{t}", f"연지가 {_label_branch(ref)}인 사람에게 {_label_branch(t)}는 무슨 신살인가?",
                ss, SINSAL_ORDER,
                f"연지 {_label_branch(ref)}의 삼합 그룹 첫 글자에서 지살부터 순서대로 돕니다. {_label_branch(t)}는 {ss}입니다."))
    # 신살 개념
    concept_q = [
        ("이동·여행·해외 인연을 뜻하는 신살은?", "역마살", "역마(驛馬)는 옛 파발마 — 이동과 변화의 기운입니다.", ["도화살", "화개살", "장성살", "겁살"]),
        ("시선을 끄는 매력·인기를 뜻하는 신살은?", "도화살", "도화(桃花)는 복숭아꽃 — 매력과 인기입니다. 12신살의 '년살'에 해당합니다.", ["역마살", "화개살", "반안살", "천살"]),
        ("예술·종교·철학적 재능과 내면 침잠을 뜻하는 신살은?", "화개살", "화개(華蓋)는 화려함을 덮는 일산 — 예술·철학의 별입니다.", ["역마살", "도화살", "망신살", "월살"]),
        ("권위와 지위, 중심 세력이 되는 당당한 신살은?", "장성살", "장성(將星)은 장군의 별 — 권위와 리더십입니다.", ["육해살", "재살", "지살", "겁살"]),
    ]
    for i, (q, a, ex, wrongs) in enumerate(concept_q):
        items.append(_make_item(rng, f"sinc:{i}", q, a, wrongs + [a], ex))
    # 공망
    gz_samples = rng.sample(GANZHI_LIST, 5)
    gm_pool = ['戌亥', '申酉', '午未', '辰巳', '寅卯', '子丑']
    for gz in gz_samples:
        gm = get_gongmang(gz)
        items.append(_make_item(
            rng, f"gm:{gz}", f"{_label_ganzhi(gz)} 일주의 공망은?", gm, gm_pool,
            f"60갑자를 10개씩 묶은 순(旬)마다 짝 없는 지지 두 글자가 공망이 됩니다. {_label_ganzhi(gz)}의 공망은 {gm}입니다."))
    return items


def _pool_practice(rng: random.Random) -> list[dict]:
    """실전: 랜덤 명식(일주+월주 등)을 만들어 종합 독해 문제를 낸다."""
    items = []
    ten_gods = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인']
    stages = ['장생', '목욕', '관대', '건록', '제왕', '쇠', '병', '사', '묘', '절', '태', '양']
    for _ in range(14):
        day_gz = rng.choice(GANZHI_LIST)
        other_gz = rng.choice([g for g in GANZHI_LIST if g != day_gz])
        dg, db = day_gz[0], day_gz[1]
        og, ob = other_gz[0], other_gz[1]
        case = f"일주가 {_label_ganzhi(day_gz)}, 월주가 {_label_ganzhi(other_gz)}인 명식"

        qtype = rng.choice(['ilgan', 'ilgan_el', 'wolgan_ss', 'ilji_us', 'wolji_ss', 'relation'])
        if qtype == 'ilgan':
            items.append(_make_item(
                rng, f"pr_ilgan:{day_gz}", f"{case} — 이 사람의 일간은?",
                _label_stem(dg), [_label_stem(s) for s in HEAVENLY_STEMS],
                f"일주 {_label_ganzhi(day_gz)}의 천간이 일간입니다. 일간은 {_label_stem(dg)}."))
        elif qtype == 'ilgan_el':
            el = ELEMENTS_MAP[dg]
            items.append(_make_item(
                rng, f"pr_el:{day_gz}", f"{case} — 일간의 오행은?", el, ELEMENTS,
                f"일간 {_label_stem(dg)}의 오행은 {el}입니다."))
        elif qtype == 'wolgan_ss':
            tg = GAN_TEN_GODS[dg][og]
            items.append(_make_item(
                rng, f"pr_ss:{day_gz}{og}", f"{case} — 월간 {_label_stem(og)}의 십성은?", tg, ten_gods,
                f"일간 {_label_stem(dg)}({ELEMENTS_MAP[dg]}) 기준 {_label_stem(og)}({ELEMENTS_MAP[og]})은 {tg}입니다."))
        elif qtype == 'ilji_us':
            st = TWELVE_GROWTH[dg][db]
            items.append(_make_item(
                rng, f"pr_us:{day_gz}", f"{case} — 일간이 일지 {_label_branch(db)}에서 갖는 12운성은?", st, stages,
                f"{_label_stem(dg)} 일간은 {_label_branch(db)}에서 {st}입니다."))
        elif qtype == 'wolji_ss':
            hidden = BRANCH_HIDDEN_GANS[ob]
            tg = GAN_TEN_GODS[dg][hidden]
            items.append(_make_item(
                rng, f"pr_jss:{day_gz}{ob}", f"{case} — 월지 {_label_branch(ob)}의 십성(지장간 정기 기준)은?", tg, ten_gods,
                f"{_label_branch(ob)}의 정기는 {_label_stem(hidden)}. 일간 {_label_stem(dg)} 기준 {tg}입니다."))
        else:  # relation: 일지-월지 관계 (형 포함, 관계가 둘 이상 겹치는 쌍은 모호하므로 출제 제외)
            rels = []
            for rel_name in ['합', '충', '파', '해']:
                if BRANCH_RELATIONS[rel_name].get(db) == ob:
                    rels.append(rel_name)
            h_val = BRANCH_RELATIONS['형'].get(db)
            if (isinstance(h_val, list) and ob in h_val) or (isinstance(h_val, str) and h_val == ob):
                rels.append('형')
            if len(rels) > 1:  # 寅亥(합+파)·巳申(합+형+파) 등 복수 관계 → 단일 정답 불가
                continue
            rel = rels[0] if rels else "없음"
            items.append(_make_item(
                rng, f"pr_rel:{day_gz}{ob}", f"{case} — 일지 {_label_branch(db)}와 월지 {_label_branch(ob)}의 관계는?",
                rel, ['합', '충', '형', '파', '해', '없음'],
                f"{_label_branch(db)}-{_label_branch(ob)}: " + (f"{rel} 관계입니다." if rel != '없음' else "합·충·형·파·해 어디에도 해당하지 않습니다.")))
    return items


def _pool_sinkang(rng: random.Random) -> list[dict]:
    """[고급] 신강신약·용신 — 득령 판정은 오행 관계로 동적 출제."""
    items = []
    # 득령 판정 (월지 오행 vs 일간 오행)
    deukryeong_choices = ['득령 — 월지가 비겁', '득령 — 월지가 인성', '실령', '판단 불가']
    for dg in rng.sample(HEAVENLY_STEMS, 5):
        for mb in rng.sample(EARTHLY_BRANCHES, 3):
            d_el, m_el = ELEMENTS_MAP[dg], ELEMENTS_MAP[mb]
            if m_el == d_el:
                ans, why = '득령 — 월지가 비겁', f"월지 {m_el}이 일간과 같은 오행(비겁)"
            elif GENERATES[m_el] == d_el:
                ans, why = '득령 — 월지가 인성', f"월지 {m_el}이 일간 {d_el}을 생함(인성)"
            else:
                ans, why = '실령', f"월지 {m_el}은 일간 {d_el}을 돕지 않음"
            items.append(_make_item(
                rng, f"dr:{dg}{mb}", f"일간 {_label_stem(dg)}({d_el})가 {_label_branch(mb)}월에 태어났다. 월지 판정은?",
                ans, deukryeong_choices,
                f"{why} → {ans}입니다. 득령은 신강신약 판정의 절반을 차지합니다."))
    # 개념 문제
    group_pool = ['인성·비겁', '식상·재성·관성', '비겁·식상', '재성·인성']
    concept_q = [
        ("신약(身弱)한 사주에 약(藥)이 되는 십성 그룹은?", "인성·비겁", group_pool,
         "신약은 나를 생하는 인성과 나를 돕는 비겁이 약입니다."),
        ("신강(身强)한 사주의 균형을 잡아주는 십성 그룹은?", "식상·재성·관성", group_pool,
         "신강은 기운을 빼는 식상, 써버리는 재성, 눌러주는 관성이 약입니다."),
        ("재다신약(財多身弱) 사주의 대표 용신 후보는?", "비겁", ['비겁', '재성', '식상', '관성'],
         "재성이 산처럼 많아 신약해진 사주는 재를 나눠 짊어질 비겁(우군)이 약입니다."),
        ("신강신약 판정에서 가장 비중이 큰 글자는?", "월지", ['월지', '연간', '시지', '일간'],
         "득령(월지)이 판정의 절반 — 태어난 계절이 사주의 사령부입니다."),
        ("강한 것을 누르고 약한 것을 돕는 용신법은?", "억부용신", ['억부용신', '조후용신', '통관용신', '전왕용신'],
         "억부(抑扶)는 용신 찾기의 기본 공식입니다."),
        ("사주의 추위·더위를 먼저 해결하는 용신법은?", "조후용신", ['조후용신', '억부용신', '병약용신', '전왕용신'],
         "조후(調候)는 계절이 만든 온도·습도부터 맞춥니다."),
        ("대립하는 두 오행 세력을 소통시키는 용신법은?", "통관용신", ['통관용신', '억부용신', '조후용신', '병약용신'],
         "통관(通關)은 둘 사이에 다리를 놓는 중간 오행을 씁니다."),
        ("한 오행이 사주를 압도할 때 대세를 따르는 용신법은?", "전왕용신", ['전왕용신', '억부용신', '조후용신', '통관용신'],
         "전왕(專旺)은 종격·화격 같은 특수격에 적용합니다."),
        ("한겨울(子월)생이 金·水로 치우쳤을 때 우선 용신은?", "화", ELEMENTS,
         "얼어붙은 사주는 난로(火)부터 — 조후용신입니다."),
        ("한여름(午월)생이 木·火로 치우쳤을 때 우선 용신은?", "수", ELEMENTS,
         "타들어 가는 사주는 물(水)부터 — 조후용신입니다."),
    ]
    for i, (q, a, pool, ex) in enumerate(concept_q):
        items.append(_make_item(rng, f"sk:{i}", q, a, pool, ex))
    return items


def _pool_gyeokguk(rng: random.Random) -> list[dict]:
    """[고급] 격국 — 월지 정기 십성으로 격 판정 (비겁 월지는 건록·양인 특수격)."""
    items = []
    gyeok_names = ['식신격', '상관격', '편재격', '정재격', '편관격', '정관격', '편인격', '정인격']
    # 팔정격 판정 (월지 정기가 비견·겁재인 조합은 제외)
    combos = [(dg, mb) for dg in HEAVENLY_STEMS for mb in EARTHLY_BRANCHES
              if GAN_TEN_GODS[dg][BRANCH_HIDDEN_GANS[mb]] not in ('비견', '겁재')]
    for dg, mb in rng.sample(combos, 12):
        hidden = BRANCH_HIDDEN_GANS[mb]
        ss = GAN_TEN_GODS[dg][hidden]
        items.append(_make_item(
            rng, f"gk:{dg}{mb}", f"일간 {_label_stem(dg)}가 {_label_branch(mb)}월에 태어났다(투출 없음). 격은?",
            f"{ss}격", gyeok_names,
            f"{_label_branch(mb)}의 정기 {_label_stem(hidden)}은 일간 {_label_stem(dg)} 기준 {ss} → {ss}격입니다."))
    # 건록격·양인격 (특수격)
    special_pool = ['건록격', '양인격', '정관격', '식신격']
    rokkw = [(dg, mb) for dg in HEAVENLY_STEMS for mb in EARTHLY_BRANCHES
             if TWELVE_GROWTH.get(dg, {}).get(mb) == '건록']
    for dg, mb in rng.sample(rokkw, 3):
        items.append(_make_item(
            rng, f"rok:{dg}{mb}", f"일간 {_label_stem(dg)}가 건록지인 {_label_branch(mb)}월에 태어났다. 격은?",
            '건록격', special_pool,
            f"월지가 일간의 건록(비견) 자리면 건록격 — 자수성가의 격입니다."))
    yangin = [(dg, mb) for dg in YANG_STEMS for mb in EARTHLY_BRANCHES
              if TWELVE_GROWTH.get(dg, {}).get(mb) == '제왕']
    for dg, mb in rng.sample(yangin, 3):
        items.append(_make_item(
            rng, f"yin:{dg}{mb}", f"양간 {_label_stem(dg)}가 제왕지인 {_label_branch(mb)}월에 태어났다. 격은?",
            '양인격', special_pool,
            f"양간이 월지에 제왕(가장 힘센 겁재)을 두면 양인격 — 칼을 쥐고 태어난 격입니다."))
    # 개념 문제
    concept_q = [
        ("격국을 정하는 기준이 되는 자리는?", "월지", ['월지', '일간', '연주', '시지'],
         "월지(태어난 계절)가 사주의 사령부 — 격의 출발점입니다."),
        ("월지 지장간 중 천간에 드러난 글자로 격을 정하는 원칙은?", "투출 우선", ['투출 우선', '여기 우선', '시지 우선', '합화 우선'],
         "투출(透出)한 지장간이 있으면 그 글자의 십성으로 격을 정합니다."),
        ("양인격이 성립할 수 있는 일간은?", "양간만", ['양간만', '음간만', "모든 일간", "토 일간만"],
         "양인격은 양간이 월지에 제왕을 둘 때만 성립합니다 — 음간에게는 없습니다."),
        ("월지가 일간의 비견(건록 자리)일 때의 격은?", "건록격", special_pool,
         "월지 비견은 팔정격이 아니라 건록격 — 독립·자수성가의 구조입니다."),
    ]
    for i, (q, a, pool, ex) in enumerate(concept_q):
        items.append(_make_item(rng, f"gkc:{i}", q, a, pool, ex))
    return items


CHAPTER_GENERATORS: dict[str, Callable[[random.Random], list[dict]]] = {
    "elements": _pool_elements,
    "stems": _pool_stems,
    "branches": _pool_branches,
    "ganzhi": _pool_ganzhi,
    "jijanggan": _pool_jijanggan,
    "sipseong": _pool_sipseong,
    "unseong": _pool_unseong,
    "hapchung": _pool_hapchung,
    "sinsal": _pool_sinsal,
    "practice": _pool_practice,
    "sinkang": _pool_sinkang,
    "gyeokguk": _pool_gyeokguk,
}


def generate_personal_quiz(pillars: dict, name: str = "나", count: int = 10, seed: int | None = None) -> list[dict[str, Any]]:
    """저장된 명식(pillars)으로 '내 사주로 배우기' 퀴즈를 생성한다."""
    rng = random.Random(seed)
    try:
        dg = pillars["day"]["stem"]
        db = pillars["day"]["branch"]
    except (KeyError, TypeError):
        return []
    ten_gods = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인']
    stages = ['장생', '목욕', '관대', '건록', '제왕', '쇠', '병', '사', '묘', '절', '태', '양']
    p_names = {"year": "연주", "month": "월주", "day": "일주", "hour": "시주"}
    who = f"{name}님"
    items: list[dict] = []

    # 일간·일주 기본
    items.append(_make_item(
        rng, "my_ilgan", f"{who} 명식의 일간(나 자신)은?", _label_stem(dg),
        [_label_stem(s) for s in HEAVENLY_STEMS],
        f"일주 {_label_ganzhi(pillars['day'].get('pillar', dg + db))}의 천간이 일간입니다."))
    el = ELEMENTS_MAP[dg]
    items.append(_make_item(
        rng, "my_el", f"{who}의 일간 {_label_stem(dg)}의 오행은?", el, ELEMENTS,
        f"{_label_stem(dg)}은(는) {'양' if dg in YANG_STEMS else '음'}{el}입니다."))
    items.append(_make_item(
        rng, "my_yy", f"{who}의 일간 {_label_stem(dg)}의 음양은?", '양' if dg in YANG_STEMS else '음',
        ['양', '음', '중성', '없음'],
        f"갑병무경임이 양간, 을정기신계가 음간입니다."))

    # 천간 십성 (연·월·시)
    for key in ["year", "month", "hour"]:
        st = pillars.get(key, {}).get("stem")
        if not st:
            continue
        tg = GAN_TEN_GODS[dg][st]
        items.append(_make_item(
            rng, f"my_ss:{key}", f"{who} 명식에서 {p_names[key]} 천간 {_label_stem(st)}의 십성은?", tg, ten_gods,
            f"일간 {_label_stem(dg)}({ELEMENTS_MAP[dg]}) 기준 {_label_stem(st)}({ELEMENTS_MAP[st]})은 {tg}입니다."))

    # 지지 12운성·정기 십성 (4기둥)
    for key in ["year", "month", "day", "hour"]:
        br = pillars.get(key, {}).get("branch")
        if not br:
            continue
        us = TWELVE_GROWTH[dg][br]
        items.append(_make_item(
            rng, f"my_us:{key}", f"{who}의 일간이 {p_names[key]} 지지 {_label_branch(br)}에서 갖는 12운성은?", us, stages,
            f"{_label_stem(dg)} 일간은 {_label_branch(br)}에서 {us}입니다."))
        hidden = BRANCH_HIDDEN_GANS[br]
        tg = GAN_TEN_GODS[dg][hidden]
        items.append(_make_item(
            rng, f"my_jss:{key}", f"{who} 명식에서 {p_names[key]} 지지 {_label_branch(br)}의 십성(정기 기준)은?", tg, ten_gods,
            f"{_label_branch(br)}의 정기는 {_label_stem(hidden)} → 일간 {_label_stem(dg)} 기준 {tg}입니다."))

    # 지지 관계 (단일 관계 쌍만 출제)
    keys = [k for k in ["year", "month", "day", "hour"] if pillars.get(k, {}).get("branch")]
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            b1, b2 = pillars[keys[i]]["branch"], pillars[keys[j]]["branch"]
            rels = [r for r in ['합', '충', '파', '해'] if BRANCH_RELATIONS[r].get(b1) == b2]
            h = BRANCH_RELATIONS['형'].get(b1)
            if (isinstance(h, list) and b2 in h) or (isinstance(h, str) and h == b2):
                rels.append('형')
            if len(rels) != 1:
                continue
            items.append(_make_item(
                rng, f"my_rel:{keys[i]}{keys[j]}",
                f"{who} 명식에서 {p_names[keys[i]]} {_label_branch(b1)}와 {p_names[keys[j]]} {_label_branch(b2)}의 관계는?",
                rels[0], ['합', '충', '형', '파', '해', '없음'],
                f"{_label_branch(b1)}-{_label_branch(b2)}는 {rels[0]} 관계입니다."))

    # 공망
    day_pillar = pillars["day"].get("pillar")
    if day_pillar:
        gm = get_gongmang(day_pillar)
        if gm != "-":
            items.append(_make_item(
                rng, "my_gm", f"{who}의 일주 {_label_ganzhi(day_pillar)} 기준 공망은?", gm,
                ['戌亥', '申酉', '午未', '辰巳', '寅卯', '子丑'],
                f"{_label_ganzhi(day_pillar)}가 속한 순(旬)의 빈 지지가 공망입니다 → {gm}."))

    # 오행 분포 (최다 오행이 유일할 때만)
    counts: dict[str, int] = {e: 0 for e in ELEMENTS}
    for key in ["year", "month", "day", "hour"]:
        for ch in [pillars.get(key, {}).get("stem"), pillars.get(key, {}).get("branch")]:
            e = ELEMENTS_MAP.get(ch)
            if e:
                counts[e] += 1
    top = max(counts.values())
    tops = [e for e, c in counts.items() if c == top]
    if len(tops) == 1:
        items.append(_make_item(
            rng, "my_top_el", f"{who} 명식 여덟 글자 중 가장 많은 오행은?", tops[0], ELEMENTS,
            f"오행 분포: " + " · ".join(f"{e} {c}개" for e, c in counts.items() if c) + f" → {tops[0]}이(가) 가장 많습니다."))

    rng.shuffle(items)
    return items[:max(1, min(count, len(items)))]


def generate_placement_quiz(seed: int | None = None) -> list[dict[str, Any]]:
    """레벨 테스트: 10챕터에서 1문항씩 골라 학습 시작점을 진단한다. 각 문항에 chapter 태그 포함."""
    rng = random.Random(seed)
    items = []
    for chapter_id, gen in CHAPTER_GENERATORS.items():
        pool = gen(rng)
        item = pool[rng.randrange(len(pool))]
        item["chapter"] = chapter_id
        items.append(item)
    return items  # 챕터 순서 유지 (쉬운 것 → 어려운 것)


def generate_quiz(chapter_id: str, count: int = 10, seed: int | None = None) -> list[dict[str, Any]]:
    """챕터 퀴즈 N문항 생성. seed 지정 시 재현 가능."""
    gen = CHAPTER_GENERATORS.get(chapter_id)
    if not gen:
        return []
    rng = random.Random(seed)
    pool = gen(rng)
    rng.shuffle(pool)
    # 같은 key(같은 지식 포인트) 중복 출제 방지
    seen: set[str] = set()
    result = []
    for item in pool:
        if item["key"] in seen:
            continue
        seen.add(item["key"])
        result.append(item)
        if len(result) >= count:
            break
    return result
