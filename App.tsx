import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Easing, Pressable, SafeAreaView,
  ScrollView, Share, StyleSheet, Text, TextInput, View,
} from 'react-native';

// ── Types ────────────────────────────────────────────────────────────────────
type FunCategory  = { key: string; label: string; color: string };
type RegCategory  = { key: string; label: string; color: string };
type FunExpense   = { id: string; amount: number; category: string; note: string; createdAt: string };
type RegExpense   = { id: string; amount: number; category: string; note: string; createdAt: string };
type IncomeEntry  = { id: string; amount: number; source: string; note: string; createdAt: string };
type MonthData    = {
  funBudget: number;
  funExpenses: FunExpense[];
  savingsEnabled: boolean;
  savingsSetAside: number;
  income: IncomeEntry[];
  regExpenses: RegExpense[];
  regBudgets: Record<string, number>; // planned regular-expense amounts per category
};
type StoredData   = { funCategories: FunCategory[]; regCategories: RegCategory[]; months: Record<string, MonthData> };
type ScreenMode   = 'jar' | 'life' | 'daily' | 'history';

// ── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'dinis-money-jar-monthly-budget';

const DEFAULT_FUN_CATS: FunCategory[] = [
  { key: 'crafts',  label: 'Crafts & Art',   color: '#ff8a80' },
  { key: 'fun',     label: 'Entertainment',  color: '#ffd166' },
  { key: 'dining',  label: 'Dining Out',     color: '#ff9f6e' },
  { key: 'shop',    label: 'Shopping',       color: '#7c7cff' },
  { key: 'other-f', label: 'Other',          color: '#a78bfa' },
];
const DEFAULT_REG_CATS: RegCategory[] = [
  { key: 'grocery',  label: 'Groceries',     color: '#4ecdc4' },
  { key: 'transit',  label: 'Transport',     color: '#2ec4b6' },
  { key: 'housing',  label: 'Housing / Rent',color: '#6d8dff' },
  { key: 'utils',    label: 'Utilities',     color: '#64b5f6' },
  { key: 'medical',  label: 'Medical',       color: '#f48fb1' },
  { key: 'personal', label: 'Personal Care', color: '#ce93d8' },
  { key: 'other-r',  label: 'Other',         color: '#90a4ae' },
];
const FUN_COLORS  = ['#ff8a80','#ffd166','#7c7cff','#ff9f6e','#a78bfa','#ff5d8f','#2ec4b6','#ffd54f'];
const REG_COLORS  = ['#4ecdc4','#2ec4b6','#6d8dff','#64b5f6','#f48fb1','#ce93d8','#90a4ae','#a5d6a7'];
const QUICK_BUDGETS  = [250, 500, 750, 1000, 1500, 2000];
const INCOME_SOURCES = ['Salary', 'Disability', 'Freelance', 'Gift', 'Transfer', 'Other'];

// ── Helpers ──────────────────────────────────────────────────────────────────
function getMonthKey(date = new Date()) {
  if (date.getDate() < 15) {
    const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    return `${prev.getFullYear()}-${`${prev.getMonth() + 1}`.padStart(2, '0')}`;
  }
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}
function shiftMonth(mk: string, delta: number) {
  const [y, m] = mk.split('-').map(Number);
  return getMonthKey(new Date(y, m - 1 + delta, 1));
}
function getMonthLabel(mk: string) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
function getPeriodLabel(mk: string) {
  const [y, m] = mk.split('-').map(Number);
  const start = new Date(y, m - 1, 15).toLocaleString('en-US', { month: 'long', day: 'numeric' });
  const end   = new Date(y, m, 14).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `${start} – ${end}`;
}
function fmt(v: number) { return `₪${v.toFixed(2)}`; }

function emptyMonth(): MonthData {
  return { funBudget: 0, funExpenses: [], savingsEnabled: false, savingsSetAside: 0, income: [], regExpenses: [], regBudgets: {} };
}

function normalizeData(raw: string | null, curKey: string): StoredData {
  if (!raw) return { funCategories: DEFAULT_FUN_CATS, regCategories: DEFAULT_REG_CATS, months: { [curKey]: emptyMonth() } };
  const p = JSON.parse(raw) as any;

  // Legacy format (old app had budget + expenses at root)
  if (!p.funCategories && !p.months) {
    return {
      funCategories: DEFAULT_FUN_CATS,
      regCategories: DEFAULT_REG_CATS,
      months: { [p.monthKey ?? curKey]: { funBudget: p.budget ?? 0, funExpenses: p.expenses ?? [], savingsEnabled: false, savingsSetAside: 0, income: [], regExpenses: [], regBudgets: {} } },
    };
  }
  // Previous iteration had categories + months (fun only)
  const funCats = p.funCategories ?? p.categories ?? DEFAULT_FUN_CATS;
  const regCats = p.regCategories ?? DEFAULT_REG_CATS;
  const rawMonths: Record<string, any> = p.months ?? {};
  const months: Record<string, MonthData> = {};
  for (const [k, v] of Object.entries(rawMonths)) {
    const mv = v as any;
    months[k] = {
      funBudget:      mv.funBudget      ?? mv.budget ?? 0,
      funExpenses:    mv.funExpenses    ?? mv.expenses ?? [],
      savingsEnabled: mv.savingsEnabled ?? false,
      savingsSetAside:mv.savingsSetAside ?? 0,
      income:         mv.income         ?? [],
      regExpenses:    mv.regExpenses    ?? [],
      regBudgets:     mv.regBudgets     ?? mv.categoryBudgets ?? {},
    };
  }
  if (!Object.keys(months).length) months[curKey] = emptyMonth();
  return { funCategories: funCats.length ? funCats : DEFAULT_FUN_CATS, regCategories: regCats.length ? regCats : DEFAULT_REG_CATS, months };
}

// ── Loading screen ────────────────────────────────────────────────────────────
function LoadingScreen() {
  const jarY = useRef(new Animated.Value(0)).current;
  const moneyA = useRef(new Animated.Value(-80)).current;
  const moneyB = useRef(new Animated.Value(-120)).current;
  const opA = useRef(new Animated.Value(0)).current;
  const opB = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const bounce = Animated.loop(Animated.sequence([
      Animated.timing(jarY, { toValue: -6, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(jarY, { toValue: 0,  duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const dropA = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(opA,    { toValue: 1,   duration: 100,  useNativeDriver: true }),
        Animated.timing(moneyA, { toValue: 170, duration: 1050, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.timing(opA,    { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(moneyA, { toValue: -80, duration: 1,  useNativeDriver: true }),
    ]));
    const dropB = Animated.loop(Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(opB,    { toValue: 1,   duration: 100,  useNativeDriver: true }),
        Animated.timing(moneyB, { toValue: 170, duration: 1120, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.timing(opB,    { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(moneyB, { toValue: -120, duration: 1, useNativeDriver: true }),
    ]));
    bounce.start(); dropA.start(); dropB.start();
    return () => { bounce.stop(); dropA.stop(); dropB.stop(); };
  }, [jarY, moneyA, moneyB, opA, opB]);

  return (
    <SafeAreaView style={s.loadingScreen}>
      <StatusBar style="light" />
      <View style={s.loadingInner}>
        <Text style={s.loadingBrand}>Dini&apos;s Money Jar</Text>
        <Text style={s.loadingTitle}>Counting coins, stacking bills, and loading your months...</Text>
        <View style={s.loadingStage}>
          <Animated.View style={[s.fallingMoney, s.fallingMoneyL, { opacity: opA, transform: [{ translateY: moneyA }, { rotate: '-10deg' }] }]}>
            <Text style={s.fallingMoneyText}>₪</Text>
          </Animated.View>
          <Animated.View style={[s.fallingMoney, s.fallingMoneyR, { opacity: opB, transform: [{ translateY: moneyB }, { rotate: '8deg' }] }]}>
            <Text style={s.fallingMoneyText}>₪</Text>
          </Animated.View>
          <Animated.View style={{ transform: [{ translateY: jarY }] }}>
            <View style={s.loadingLid} />
            <View style={s.loadingJar}><View style={s.loadingFill} /></View>
          </Animated.View>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const curKey = getMonthKey();

  // Data state
  const [funCats,  setFunCats]  = useState<FunCategory[]>(DEFAULT_FUN_CATS);
  const [regCats,  setRegCats]  = useState<RegCategory[]>(DEFAULT_REG_CATS);
  const [months,   setMonths]   = useState<Record<string, MonthData>>({ [curKey]: emptyMonth() });
  const [selKey,   setSelKey]   = useState(curKey);
  const [screen,   setScreen]   = useState<ScreenMode>('jar');
  const [ready,    setReady]    = useState(false);

  // Daily view
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Fun expense UI
  const [funCat,   setFunCat]   = useState(DEFAULT_FUN_CATS[0].key);
  const [funAmt,   setFunAmt]   = useState('');
  const [funNote,  setFunNote]  = useState('');

  // Budget
  const [budgetIn, setBudgetIn] = useState('');

  // Savings
  const [savIn,    setSavIn]    = useState('');

  // Income UI
  const [incAmt,   setIncAmt]   = useState('');
  const [incSrc,   setIncSrc]   = useState(INCOME_SOURCES[0]);
  const [incNote,  setIncNote]  = useState('');

  // Regular expense UI
  const [regCat,   setRegCat]   = useState(DEFAULT_REG_CATS[0].key);
  const [regAmt,   setRegAmt]   = useState('');
  const [regNote,  setRegNote]  = useState('');
  const [regPlanInputs, setRegPlanInputs] = useState<Record<string, string>>({});

  // Category editors
  const [newFunLabel,  setNewFunLabel]  = useState('');
  const [newFunColor,  setNewFunColor]  = useState(FUN_COLORS[0]);
  const [newRegLabel,  setNewRegLabel]  = useState('');
  const [newRegColor,  setNewRegColor]  = useState(REG_COLORS[0]);
  const [renameKey,    setRenameKey]    = useState<string | null>(null);
  const [renameVal,    setRenameVal]    = useState('');
  const [renameType,   setRenameType]   = useState<'fun' | 'reg'>('fun');

  // Jar animation refs
  const jarFill = useRef(new Animated.Value(24)).current;
  const coinA = useRef(new Animated.Value(0)).current;
  const coinB = useRef(new Animated.Value(0)).current;
  const coinC = useRef(new Animated.Value(0)).current;
  const billA = useRef(new Animated.Value(0)).current;
  const billB = useRef(new Animated.Value(0)).current;

  // Load from storage
  useEffect(() => {
    let mounted = true;
    async function load() {
      const started = Date.now();
      const data = normalizeData(await AsyncStorage.getItem(STORAGE_KEY), curKey);
      await new Promise(r => setTimeout(r, Math.max(0, 1700 - (Date.now() - started))));
      if (!mounted) return;
      setFunCats(data.funCategories);
      setRegCats(data.regCategories);
      setMonths(data.months);
      setFunCat(data.funCategories[0]?.key ?? DEFAULT_FUN_CATS[0].key);
      setRegCat(data.regCategories[0]?.key ?? DEFAULT_REG_CATS[0].key);
      setReady(true);
    }
    load().catch(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, [curKey]);

  // Save to storage
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ funCategories: funCats, regCategories: regCats, months }))
      .catch(() => Alert.alert('Storage issue', 'Could not save your latest changes.'));
  }, [funCats, regCats, months, ready]);

  // Derived month data
  const month = months[selKey] ?? emptyMonth();
  const funSpent    = month.funExpenses.reduce((s, e) => s + e.amount, 0);
  const setAside    = month.savingsEnabled ? month.savingsSetAside : 0;
  const funAvail    = Math.max(month.funBudget - setAside, 0);
  const funLeft     = funAvail - funSpent;
  const fillHeight  = funAvail > 0 ? 24 + Math.max(0, Math.min(funLeft / funAvail, 1)) * 250 : 24;
  const totalIncome = month.income.reduce((s, e) => s + e.amount, 0);
  const regSpent    = month.regExpenses.reduce((s, e) => s + e.amount, 0);
  const disposable  = totalIncome - regSpent;
  const leftAfterFun = disposable - month.funBudget;

  useEffect(() => {
    setBudgetIn(month.funBudget ? `${month.funBudget}` : '');
    setSavIn(month.savingsSetAside ? `${month.savingsSetAside}` : '');
  }, [month.funBudget, month.savingsSetAside, selKey]);

  // Jar fill animation
  useEffect(() => {
    Animated.spring(jarFill, { toValue: fillHeight, friction: 10, tension: 55, useNativeDriver: false }).start();
  }, [fillHeight, jarFill]);

  // Coin/bill bobbing
  useEffect(() => {
    const bob = (v: Animated.Value, delay: number, r: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: -r, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0,  duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]));
    const anims = [bob(coinA,0,4),bob(coinB,300,5),bob(coinC,600,3),bob(billA,150,4),bob(billB,450,5)];
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, [coinA,coinB,coinC,billA,billB]);

  // Build per-day totals for the selected month's period (15th → 14th)
  const dailyData = useMemo(() => {
    const [y, m] = selKey.split('-').map(Number);
    // Period: 15th of selKey month → 14th of next month
    const periodStart = new Date(y, m - 1, 15);
    const periodEnd   = new Date(y, m, 14);
    const days: { dateStr: string; label: string; fun: number; reg: number; dayNum: number }[] = [];
    const cur = new Date(periodStart);
    while (cur <= periodEnd) {
      const dateStr = cur.toISOString().slice(0, 10);
      const dayNum  = cur.getDate();
      const mo      = cur.getMonth();
      const yr      = cur.getFullYear();
      const label   = cur.toLocaleString('en-US', { month: 'short', day: 'numeric' });
      const fun = month.funExpenses
        .filter(e => e.createdAt.slice(0, 10) === dateStr)
        .reduce((s, e) => s + e.amount, 0);
      const reg = month.regExpenses
        .filter(e => e.createdAt.slice(0, 10) === dateStr)
        .reduce((s, e) => s + e.amount, 0);
      days.push({ dateStr, label, fun, reg, dayNum });
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [selKey, month.funExpenses, month.regExpenses]);

  const maxDayTotal = useMemo(() =>
    Math.max(...dailyData.map(d => d.fun + d.reg), 1),
    [dailyData]
  );

  const monthOptions = useMemo(() => {
    const keys = new Set(Object.keys(months));
    for (let i = -4; i <= 7; i++) keys.add(shiftMonth(curKey, i));
    return Array.from(keys).sort();
  }, [curKey, months]);

  function updateMonth(next: MonthData) {
    setMonths(cur => ({ ...cur, [selKey]: next }));
  }

  // ── Fun expense handlers ───────────────────────────────────────────────────
  function addFunExpense() {
    const amt = Number.parseFloat(funAmt);
    if (Number.isNaN(amt) || amt <= 0) { Alert.alert('Enter an amount'); return; }
    updateMonth({ ...month, funExpenses: [{ id: `${Date.now()}`, amount: amt, category: funCat, note: funNote.trim(), createdAt: new Date().toISOString() }, ...month.funExpenses] });
    setFunAmt(''); setFunNote('');
  }
  function deleteFunExpense(id: string) {
    updateMonth({ ...month, funExpenses: month.funExpenses.filter(e => e.id !== id) });
  }

  // ── Budget & savings ───────────────────────────────────────────────────────
  function saveBudget() {
    const v = Number.parseFloat(budgetIn);
    if (Number.isNaN(v) || v <= 0) { Alert.alert('Enter a budget'); return; }
    if (month.funBudget > 0 && v > month.funBudget) { Alert.alert('Budget locked', 'You can lower the fun budget but not raise it once the month has started.'); return; }
    updateMonth({ ...month, funBudget: v });
  }
  function toggleSavings() {
    if (!month.savingsEnabled) { updateMonth({ ...month, savingsEnabled: true }); return; }
    updateMonth({ ...month, savingsEnabled: false, savingsSetAside: 0 }); setSavIn('');
  }
  function saveSavings() {
    const v = Number.parseFloat(savIn);
    if (Number.isNaN(v) || v < 0) { Alert.alert('Enter savings amount'); return; }
    if (v > month.funBudget) { Alert.alert('Too high', 'Savings cannot exceed the fun budget.'); return; }
    updateMonth({ ...month, savingsEnabled: true, savingsSetAside: v });
  }
  function resetMonth() {
    Alert.alert('Reset this month?', 'Clears all data for this month only.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => updateMonth(emptyMonth()) },
    ]);
  }

  // ── Income handlers ────────────────────────────────────────────────────────
  function addIncome() {
    const amt = Number.parseFloat(incAmt);
    if (Number.isNaN(amt) || amt <= 0) { Alert.alert('Enter an amount'); return; }
    updateMonth({ ...month, income: [{ id: `${Date.now()}`, amount: amt, source: incSrc, note: incNote.trim(), createdAt: new Date().toISOString() }, ...month.income] });
    setIncAmt(''); setIncNote('');
  }
  function deleteIncome(id: string) {
    updateMonth({ ...month, income: month.income.filter(e => e.id !== id) });
  }

  // ── Regular expense handlers ──────────────────────────────────────────────
  function addRegExpense() {
    const amt = Number.parseFloat(regAmt);
    if (Number.isNaN(amt) || amt <= 0) { Alert.alert('Enter an amount'); return; }
    updateMonth({ ...month, regExpenses: [{ id: `${Date.now()}`, amount: amt, category: regCat, note: regNote.trim(), createdAt: new Date().toISOString() }, ...month.regExpenses] });
    setRegAmt(''); setRegNote('');
  }
  function deleteRegExpense(id: string) {
    updateMonth({ ...month, regExpenses: month.regExpenses.filter(e => e.id !== id) });
  }
  function saveRegPlan(catKey: string) {
    const v = Number.parseFloat(regPlanInputs[catKey] ?? '');
    if (Number.isNaN(v) || v < 0) { Alert.alert('Enter an amount'); return; }
    updateMonth({ ...month, regBudgets: { ...month.regBudgets, [catKey]: v } });
    setRegPlanInputs(p => ({ ...p, [catKey]: '' }));
  }

  // ── Category editors ───────────────────────────────────────────────────────
  function addFunCat() {
    const label = newFunLabel.trim(); if (!label) return;
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const key = funCats.some(c => c.key === base) ? `${base}-${Date.now()}` : base;
    setFunCats(cur => [...cur, { key, label, color: newFunColor }]);
    setFunCat(key); setNewFunLabel('');
  }
  function addRegCat() {
    const label = newRegLabel.trim(); if (!label) return;
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const key = regCats.some(c => c.key === base) ? `${base}-${Date.now()}` : base;
    setRegCats(cur => [...cur, { key, label, color: newRegColor }]);
    setRegCat(key); setNewRegLabel('');
  }
  function saveRename() {
    if (!renameKey || !renameVal.trim()) return;
    if (renameType === 'fun') setFunCats(cur => cur.map(c => c.key === renameKey ? { ...c, label: renameVal.trim() } : c));
    else setRegCats(cur => cur.map(c => c.key === renameKey ? { ...c, label: renameVal.trim() } : c));
    setRenameKey(null); setRenameVal('');
  }
  function removeFunCat(key: string) {
    if (funCats.length <= 1) return;
    const fb = funCats.find(c => c.key !== key)!;
    setFunCats(cur => cur.filter(c => c.key !== key));
    setMonths(cur => {
      const next: Record<string, MonthData> = {};
      for (const [k, v] of Object.entries(cur)) next[k] = { ...v, funExpenses: v.funExpenses.map(e => e.category === key ? { ...e, category: fb.key } : e) };
      return next;
    });
    if (funCat === key) setFunCat(fb.key);
  }
  function removeRegCat(key: string) {
    if (regCats.length <= 1) return;
    const fb = regCats.find(c => c.key !== key)!;
    setRegCats(cur => cur.filter(c => c.key !== key));
    setMonths(cur => {
      const next: Record<string, MonthData> = {};
      for (const [k, v] of Object.entries(cur)) {
        const { [key]: _, ...restBudgets } = v.regBudgets;
        next[k] = { ...v, regExpenses: v.regExpenses.map(e => e.category === key ? { ...e, category: fb.key } : e), regBudgets: restBudgets };
      }
      return next;
    });
    if (regCat === key) setRegCat(fb.key);
  }

  // ── CSV export ────────────────────────────────────────────────────────────
  const csvText = useMemo(() => {
    const rows = Object.entries(months).sort().map(([mk, v]) => {
      const fSpent = v.funExpenses.reduce((s,e) => s+e.amount, 0);
      const inc    = (v.income ?? []).reduce((s,e) => s+e.amount, 0);
      const rSpent = (v.regExpenses ?? []).reduce((s,e) => s+e.amount, 0);
      return `${getPeriodLabel(mk)},${inc.toFixed(2)},${rSpent.toFixed(2)},${v.funBudget.toFixed(2)},${fSpent.toFixed(2)}`;
    });
    return ['Period,Income,Regular Expenses,Fun Budget,Fun Spent', ...rows].join('\n');
  }, [months]);

  async function shareCsv() { await Share.share({ message: csvText, title: "Dini's Money Jar export" }); }

  if (!ready) return <LoadingScreen />;

  return (
    <SafeAreaView style={s.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        <View style={s.hero}>
          <Text style={s.brand}>Dini&apos;s Money Jar</Text>
          <Text style={s.heroTitle}>Your fun budget, your real life, all in one place.</Text>
        </View>

        {/* Tabs */}
        <View style={s.tabs}>
          {(['jar','life','daily','history'] as ScreenMode[]).map(m => (
            <Pressable key={m} onPress={() => setScreen(m)} style={[s.tab, screen === m && s.tabActive]}>
              <Text style={[s.tabText, screen === m && s.tabTextActive]}>
                {m === 'jar' ? '🫙 Jar' : m === 'life' ? '💳 Life' : m === 'daily' ? '📊 Daily' : '📅 History'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Month picker */}
        <View style={s.card}>
          <Text style={s.title}>Month</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.monthRow}>
            {monthOptions.map(mk => (
              <Pressable key={mk} onPress={() => setSelKey(mk)} style={[s.monthChip, selKey === mk && s.monthChipActive]}>
                <Text style={[s.monthText, selKey === mk && s.monthTextActive]}>{getMonthLabel(mk)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* ═══════════════════════ JAR TAB ═══════════════════════ */}
        {screen === 'jar' ? (
          <>
            {/* Jar visualization */}
            <View style={s.card}>
              <Text style={s.title}>Fun Jar 🫙</Text>
              <Text style={s.subtitle}>{getPeriodLabel(selKey)} · The jar empties as you spend on fun things.</Text>
              <View style={s.jarWrap}>
                <View style={s.jarLid} />
                <View style={s.jarGlass}>
                  <Animated.View style={[s.jarFill, { height: jarFill }]} />
                  <Animated.View style={[s.jarBill, s.jarBillL, { transform: [{ translateY: billA }, { rotate: '-8deg' }] }]}>
                    <Text style={s.jarBillText}>₪</Text>
                  </Animated.View>
                  <Animated.View style={[s.jarBill, s.jarBillR, { transform: [{ translateY: billB }, { rotate: '6deg' }] }]}>
                    <Text style={s.jarBillText}>₪</Text>
                  </Animated.View>
                  <Animated.View style={[s.jarCoin, { bottom: 60, left: 30, transform: [{ translateY: coinA }] }]}>
                    <Text style={s.jarCoinText}>₪</Text>
                  </Animated.View>
                  <Animated.View style={[s.jarCoin, { bottom: 90, right: 28, transform: [{ translateY: coinB }] }]}>
                    <Text style={s.jarCoinText}>₪</Text>
                  </Animated.View>
                  <Animated.View style={[s.jarCoin, { bottom: 45, left: 80, transform: [{ translateY: coinC }] }]}>
                    <Text style={s.jarCoinText}>₪</Text>
                  </Animated.View>
                </View>
              </View>
              <View style={s.row}>
                <View style={[s.stat, { backgroundColor: '#ffb3c7' }]}>
                  <Text style={s.statLabel}>Fun spent</Text>
                  <Text style={s.statValue}>{fmt(funSpent)}</Text>
                </View>
                <View style={[s.stat, { backgroundColor: '#b7f7cb' }]}>
                  <Text style={s.statLabel}>Left to spend</Text>
                  <Text style={s.statValue}>{fmt(funLeft)}</Text>
                </View>
              </View>
              <View style={s.row}>
                <View style={[s.stat, { backgroundColor: '#ffe38a' }]}>
                  <Text style={s.statLabel}>Fun budget</Text>
                  <Text style={s.statValue}>{fmt(month.funBudget)}</Text>
                </View>
                <View style={[s.stat, { backgroundColor: '#d8cbff' }]}>
                  <Text style={s.statLabel}>Savings tucked away</Text>
                  <Text style={s.statValue}>{fmt(setAside)}</Text>
                </View>
              </View>
            </View>

            {/* Set fun budget */}
            <View style={s.card}>
              <Text style={s.title}>Set fun budget</Text>
              <Pressable onPress={resetMonth} style={s.secondaryButton}><Text style={s.secondaryButtonText}>Reset month</Text></Pressable>
              <Text style={s.subtitle}>
                {month.funBudget > 0
                  ? `Locked at ${fmt(month.funBudget)} for fun spending. You can lower it but not raise it.`
                  : 'How much do you want to spend on fun things this month?'}
              </Text>
              <TextInput style={s.input} value={budgetIn} onChangeText={setBudgetIn} keyboardType="decimal-pad" placeholder="e.g. 600" placeholderTextColor="#7d6b91" />
              <View style={s.chipWrap}>
                {QUICK_BUDGETS.map(amt => (
                  <Pressable key={amt} onPress={() => setBudgetIn(`${amt}`)} style={s.quickChip}>
                    <Text style={s.quickChipText}>{fmt(amt)}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={saveBudget} style={s.primaryButton}>
                <Text style={s.primaryButtonText}>{month.funBudget > 0 ? 'Save lower budget' : 'Save budget'}</Text>
              </Pressable>
            </View>

            {/* Savings */}
            <View style={s.card}>
              <Text style={s.title}>Savings jar</Text>
              <Pressable onPress={toggleSavings} style={[s.savingsToggle, month.savingsEnabled && s.savingsToggleActive]}>
                <View style={[s.checkbox, month.savingsEnabled && s.checkboxActive]}>
                  {month.savingsEnabled ? <Text style={s.checkboxText}>✓</Text> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.subheading}>Tuck some away this month</Text>
                  <Text style={s.subtitle}>Reduce fun spending money by saving a portion first.</Text>
                </View>
              </Pressable>
              {month.savingsEnabled ? (
                <>
                  <TextInput style={s.input} value={savIn} onChangeText={setSavIn} keyboardType="decimal-pad" placeholder="How much to save?" placeholderTextColor="#7d6b91" />
                  <Pressable onPress={saveSavings} style={s.primaryButton}><Text style={s.primaryButtonText}>Save savings amount</Text></Pressable>
                </>
              ) : <Text style={s.subtitle}>No savings tucked away yet.</Text>}
            </View>

            {/* Add fun expense */}
            <View style={s.card}>
              <Text style={s.title}>Add fun expense</Text>
              <View style={s.chipWrap}>
                {funCats.map(c => (
                  <Pressable key={c.key} onPress={() => setFunCat(c.key)} style={[s.categoryChip, { backgroundColor: funCat === c.key ? c.color : '#f2ebff' }]}>
                    <Text style={[s.categoryText, funCat === c.key && s.categoryTextActive]}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput style={s.input} value={funAmt} onChangeText={setFunAmt} keyboardType="decimal-pad" placeholder="Amount spent" placeholderTextColor="#7d6b91" />
              <TextInput style={s.input} value={funNote} onChangeText={setFunNote} placeholder="Note (optional)" placeholderTextColor="#7d6b91" />
              <Pressable onPress={addFunExpense} style={s.primaryButton}><Text style={s.primaryButtonText}>Add expense</Text></Pressable>
            </View>

            {/* Fun spending breakdown */}
            <View style={s.card}>
              <Text style={s.title}>Fun spending by category</Text>
              {month.funExpenses.length === 0
                ? <Text style={s.subtitle}>No fun expenses yet this month.</Text>
                : funCats.map(c => {
                    const total = month.funExpenses.filter(e => e.category === c.key).reduce((sum, e) => sum + e.amount, 0);
                    if (!total) return null;
                    return (
                      <View key={c.key} style={s.breakdownRow}>
                        <View style={[s.swatch, { backgroundColor: c.color }]} />
                        <Text style={s.categoryRowText}>{c.label}</Text>
                        <Text style={s.breakdownAmount}>{fmt(total)}</Text>
                      </View>
                    );
                  })
              }
            </View>

            {/* Recent fun expenses */}
            <View style={s.card}>
              <Text style={s.title}>Recent fun expenses</Text>
              {month.funExpenses.length === 0
                ? <Text style={s.subtitle}>Nothing logged yet.</Text>
                : month.funExpenses.map(e => {
                    const c = funCats.find(fc => fc.key === e.category);
                    return (
                      <View key={e.id} style={s.expenseRow}>
                        <View style={[s.expenseBar, { backgroundColor: c?.color ?? '#a78bfa' }]} />
                        <View style={s.expenseText}>
                          <Text style={s.expenseTitle}>{c?.label ?? 'Other'}</Text>
                          <Text style={s.subtitle}>{e.note || 'No note'} · {new Date(e.createdAt).toLocaleDateString('en-US')}</Text>
                        </View>
                        <View style={s.expenseSide}>
                          <Text style={s.expenseAmount}>{fmt(e.amount)}</Text>
                          <Pressable onPress={() => deleteFunExpense(e.id)}><Text style={s.deleteText}>Delete</Text></Pressable>
                        </View>
                      </View>
                    );
                  })
              }
            </View>

            {/* Edit fun categories */}
            <View style={s.card}>
              <Text style={s.title}>Fun categories</Text>
              {funCats.map(c => (
                <View key={c.key} style={s.categoryRow}>
                  <View style={[s.swatch, { backgroundColor: c.color }]} />
                  <Text style={s.categoryRowText}>{c.label}</Text>
                  <Pressable onPress={() => { setRenameKey(c.key); setRenameVal(c.label); setRenameType('fun'); }} style={s.smallButton}><Text style={s.smallButtonText}>Edit</Text></Pressable>
                  <Pressable onPress={() => removeFunCat(c.key)} style={s.smallDanger}><Text style={s.smallDangerText}>Delete</Text></Pressable>
                </View>
              ))}
              {renameKey && renameType === 'fun' && (
                <View style={s.editorBox}>
                  <TextInput style={s.input} value={renameVal} onChangeText={setRenameVal} placeholder="Rename" placeholderTextColor="#7d6b91" />
                  <View style={s.row}>
                    <Pressable onPress={saveRename} style={[s.primaryButton, s.halfBtn]}><Text style={s.primaryButtonText}>Save</Text></Pressable>
                    <Pressable onPress={() => setRenameKey(null)} style={[s.secondaryButtonStretch, s.halfBtn]}><Text style={s.secondaryButtonText}>Cancel</Text></Pressable>
                  </View>
                </View>
              )}
              <View style={s.editorBox}>
                <TextInput style={s.input} value={newFunLabel} onChangeText={setNewFunLabel} placeholder="New fun category" placeholderTextColor="#7d6b91" />
                <View style={s.chipWrap}>
                  {FUN_COLORS.map(col => <Pressable key={col} onPress={() => setNewFunColor(col)} style={[s.colorDot, { backgroundColor: col }, newFunColor === col && s.colorDotActive]} />)}
                </View>
                <Pressable onPress={addFunCat} style={s.primaryButton}><Text style={s.primaryButtonText}>Add category</Text></Pressable>
              </View>
            </View>
          </>
        ) : null}

        {/* ═══════════════════════ LIFE TAB ═══════════════════════ */}
        {screen === 'life' ? (
          <>
            {/* Financial overview */}
            <View style={s.card}>
              <Text style={s.title}>This month at a glance</Text>
              <Text style={s.subtitle}>{getPeriodLabel(selKey)}</Text>
              <View style={s.row}>
                <View style={[s.stat, { backgroundColor: '#b7f7cb' }]}>
                  <Text style={s.statLabel}>Income received</Text>
                  <Text style={s.statValue}>{fmt(totalIncome)}</Text>
                </View>
                <View style={[s.stat, { backgroundColor: '#ffb3c7' }]}>
                  <Text style={s.statLabel}>Regular expenses</Text>
                  <Text style={s.statValue}>{fmt(regSpent)}</Text>
                </View>
              </View>
              <View style={[s.summaryRow, { backgroundColor: disposable >= 0 ? '#e8f5e9' : '#fce4ec' }]}>
                <Text style={s.summaryLabel}>Disposable income</Text>
                <Text style={[s.summaryValue, { color: disposable >= 0 ? '#2c7a3b' : '#d14a76' }]}>{fmt(disposable)}</Text>
              </View>
              <View style={[s.summaryRow, { backgroundColor: '#ede7f6' }]}>
                <Text style={s.summaryLabel}>Fun budget allocated</Text>
                <Text style={[s.summaryValue, { color: '#5a3f8a' }]}>{fmt(month.funBudget)}</Text>
              </View>
              {totalIncome > 0 && (
                <View style={[s.summaryRow, { backgroundColor: leftAfterFun >= 0 ? '#e3f2fd' : '#fce4ec' }]}>
                  <Text style={s.summaryLabel}>After fun budget</Text>
                  <Text style={[s.summaryValue, { color: leftAfterFun >= 0 ? '#1565c0' : '#d14a76' }]}>{fmt(leftAfterFun)}</Text>
                </View>
              )}
              {totalIncome === 0 && <Text style={s.subtitle}>Log your income below to see the full picture.</Text>}
            </View>

            {/* Income log */}
            <View style={s.card}>
              <Text style={s.title}>Income received</Text>
              <Text style={s.subtitle}>Log every paycheck, disability payment, freelance payment, or transfer.</Text>
              <TextInput style={s.input} value={incAmt} onChangeText={setIncAmt} keyboardType="decimal-pad" placeholder="Amount received" placeholderTextColor="#7d6b91" />
              <View style={s.chipWrap}>
                {INCOME_SOURCES.map(src => (
                  <Pressable key={src} onPress={() => setIncSrc(src)} style={[s.categoryChip, { backgroundColor: incSrc === src ? '#7c7cff' : '#f2ebff' }]}>
                    <Text style={[s.categoryText, incSrc === src && s.categoryTextActive]}>{src}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput style={s.input} value={incNote} onChangeText={setIncNote} placeholder="Note (optional)" placeholderTextColor="#7d6b91" />
              <Pressable onPress={addIncome} style={s.primaryButton}><Text style={s.primaryButtonText}>Add income</Text></Pressable>
              {month.income.length > 0 && month.income.map(e => (
                <View key={e.id} style={s.expenseRow}>
                  <View style={[s.expenseBar, { backgroundColor: '#7fe7a3' }]} />
                  <View style={s.expenseText}>
                    <Text style={s.expenseTitle}>{e.source}</Text>
                    <Text style={s.subtitle}>{e.note || 'No note'} · {new Date(e.createdAt).toLocaleDateString('en-US')}</Text>
                  </View>
                  <View style={s.expenseSide}>
                    <Text style={s.expenseAmount}>{fmt(e.amount)}</Text>
                    <Pressable onPress={() => deleteIncome(e.id)}><Text style={s.deleteText}>Delete</Text></Pressable>
                  </View>
                </View>
              ))}
            </View>

            {/* Regular expenses */}
            <View style={s.card}>
              <Text style={s.title}>Regular expenses</Text>
              <Text style={s.subtitle}>Groceries, transport, rent, utilities — the non-fun essentials. Set a planned amount per category and track what you actually spend.</Text>

              {/* Breakdown: planned vs actual */}
              {regCats.map(c => {
                const planned = month.regBudgets[c.key] ?? 0;
                const actual  = month.regExpenses.filter(e => e.category === c.key).reduce((sum, e) => sum + e.amount, 0);
                if (planned === 0 && actual === 0) return null;
                const over = planned > 0 && actual > planned;
                const progress = planned > 0 ? Math.min(actual / planned, 1) : 0;
                return (
                  <View key={c.key} style={s.catSpendRow}>
                    <View style={s.catBudgetHeader}>
                      <View style={[s.swatch, { backgroundColor: c.color }]} />
                      <Text style={s.categoryRowText}>{c.label}</Text>
                      <Text style={[s.catBadge, { color: over ? '#d14a76' : '#241042' }]}>
                        {fmt(actual)}{planned > 0 ? ` / ${fmt(planned)}` : ''}
                      </Text>
                    </View>
                    {planned > 0 && (
                      <View style={s.progressTrack}>
                        <View style={[s.progressFill, { flex: progress, backgroundColor: over ? '#ff5d8f' : c.color }]} />
                        <View style={{ flex: 1 - progress }} />
                      </View>
                    )}
                    {over && <Text style={s.overBudgetText}>Over plan by {fmt(actual - planned)}</Text>}
                  </View>
                );
              })}

              {/* Add regular expense */}
              <Text style={s.subheading}>Log a regular expense</Text>
              <View style={s.chipWrap}>
                {regCats.map(c => (
                  <Pressable key={c.key} onPress={() => setRegCat(c.key)} style={[s.categoryChip, { backgroundColor: regCat === c.key ? c.color : '#f2ebff' }]}>
                    <Text style={[s.categoryText, regCat === c.key && s.categoryTextActive]}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput style={s.input} value={regAmt} onChangeText={setRegAmt} keyboardType="decimal-pad" placeholder="Amount spent" placeholderTextColor="#7d6b91" />
              <TextInput style={s.input} value={regNote} onChangeText={setRegNote} placeholder="Note (optional)" placeholderTextColor="#7d6b91" />
              <Pressable onPress={addRegExpense} style={s.primaryButton}><Text style={s.primaryButtonText}>Add regular expense</Text></Pressable>

              {/* Recent regular expenses */}
              {month.regExpenses.length > 0 && (
                <>
                  <Text style={s.subheading}>Recent</Text>
                  {month.regExpenses.map(e => {
                    const c = regCats.find(rc => rc.key === e.category);
                    return (
                      <View key={e.id} style={s.expenseRow}>
                        <View style={[s.expenseBar, { backgroundColor: c?.color ?? '#90a4ae' }]} />
                        <View style={s.expenseText}>
                          <Text style={s.expenseTitle}>{c?.label ?? 'Other'}</Text>
                          <Text style={s.subtitle}>{e.note || 'No note'} · {new Date(e.createdAt).toLocaleDateString('en-US')}</Text>
                        </View>
                        <View style={s.expenseSide}>
                          <Text style={s.expenseAmount}>{fmt(e.amount)}</Text>
                          <Pressable onPress={() => deleteRegExpense(e.id)}><Text style={s.deleteText}>Delete</Text></Pressable>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </View>

            {/* Set planned regular amounts */}
            <View style={s.card}>
              <Text style={s.title}>Monthly plans for regular expenses</Text>
              <Text style={s.subtitle}>Set how much you expect to spend per category. Helps you see if you're on track.</Text>
              {regCats.map(c => {
                const planned = month.regBudgets[c.key] ?? 0;
                return (
                  <View key={c.key} style={s.catBudgetRow}>
                    <View style={s.catBudgetHeader}>
                      <View style={[s.swatch, { backgroundColor: c.color }]} />
                      <Text style={s.categoryRowText}>{c.label}</Text>
                      {planned > 0 && <Text style={s.catBadge}>{fmt(planned)} planned</Text>}
                    </View>
                    <View style={s.row}>
                      <TextInput
                        style={[s.input, { flex: 1 }]}
                        value={regPlanInputs[c.key] ?? ''}
                        onChangeText={t => setRegPlanInputs(p => ({ ...p, [c.key]: t }))}
                        keyboardType="decimal-pad"
                        placeholder={planned > 0 ? `Currently ${fmt(planned)}` : 'Set planned amount'}
                        placeholderTextColor="#7d6b91"
                      />
                      <Pressable onPress={() => saveRegPlan(c.key)} style={s.setButton}><Text style={s.primaryButtonText}>Set</Text></Pressable>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Edit regular categories */}
            <View style={s.card}>
              <Text style={s.title}>Regular expense categories</Text>
              {regCats.map(c => (
                <View key={c.key} style={s.categoryRow}>
                  <View style={[s.swatch, { backgroundColor: c.color }]} />
                  <Text style={s.categoryRowText}>{c.label}</Text>
                  <Pressable onPress={() => { setRenameKey(c.key); setRenameVal(c.label); setRenameType('reg'); }} style={s.smallButton}><Text style={s.smallButtonText}>Edit</Text></Pressable>
                  <Pressable onPress={() => removeRegCat(c.key)} style={s.smallDanger}><Text style={s.smallDangerText}>Delete</Text></Pressable>
                </View>
              ))}
              {renameKey && renameType === 'reg' && (
                <View style={s.editorBox}>
                  <TextInput style={s.input} value={renameVal} onChangeText={setRenameVal} placeholder="Rename" placeholderTextColor="#7d6b91" />
                  <View style={s.row}>
                    <Pressable onPress={saveRename} style={[s.primaryButton, s.halfBtn]}><Text style={s.primaryButtonText}>Save</Text></Pressable>
                    <Pressable onPress={() => setRenameKey(null)} style={[s.secondaryButtonStretch, s.halfBtn]}><Text style={s.secondaryButtonText}>Cancel</Text></Pressable>
                  </View>
                </View>
              )}
              <View style={s.editorBox}>
                <TextInput style={s.input} value={newRegLabel} onChangeText={setNewRegLabel} placeholder="New regular category" placeholderTextColor="#7d6b91" />
                <View style={s.chipWrap}>
                  {REG_COLORS.map(col => <Pressable key={col} onPress={() => setNewRegColor(col)} style={[s.colorDot, { backgroundColor: col }, newRegColor === col && s.colorDotActive]} />)}
                </View>
                <Pressable onPress={addRegCat} style={s.primaryButton}><Text style={s.primaryButtonText}>Add category</Text></Pressable>
              </View>
            </View>
          </>
        ) : null}

        {/* ═══════════════════════ DAILY TAB ═══════════════════════ */}
        {screen === 'daily' ? (
          <>
            {/* Calendar heatmap */}
            <View style={s.card}>
              <Text style={s.title}>Daily spending calendar</Text>
              <Text style={s.subtitle}>{getPeriodLabel(selKey)} · Tap a day to see the breakdown.</Text>
              {/* Legend */}
              <View style={s.calLegend}>
                <View style={s.calLegendItem}><View style={[s.calLegendDot, { backgroundColor: '#ff8a80' }]} /><Text style={s.calLegendText}>Fun</Text></View>
                <View style={s.calLegendItem}><View style={[s.calLegendDot, { backgroundColor: '#4ecdc4' }]} /><Text style={s.calLegendText}>Regular</Text></View>
                <View style={s.calLegendItem}><View style={[s.calLegendDot, { backgroundColor: '#f2ebff' }]} /><Text style={s.calLegendText}>Nothing spent</Text></View>
              </View>
              {/* Day-of-week header */}
              <View style={s.calHeader}>
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <Text key={d} style={s.calHeaderText}>{d}</Text>
                ))}
              </View>
              {/* Calendar grid — weeks rows */}
              {(() => {
                // Build a 7-column grid starting on the weekday of the first period day
                const cells: (typeof dailyData[0] | null)[] = [];
                const firstWeekday = new Date(dailyData[0]?.dateStr ?? new Date()).getDay();
                for (let i = 0; i < firstWeekday; i++) cells.push(null);
                cells.push(...dailyData);
                // Pad end to complete last row
                while (cells.length % 7 !== 0) cells.push(null);
                const weeks: (typeof dailyData[0] | null)[][] = [];
                for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
                return weeks.map((week, wi) => (
                  <View key={wi} style={s.calWeekRow}>
                    {week.map((day, di) => {
                      if (!day) return <View key={di} style={s.calDayEmpty} />;
                      const total = day.fun + day.reg;
                      const intensity = total > 0 ? Math.max(0.15, Math.min(total / maxDayTotal, 1)) : 0;
                      const hasFun = day.fun > 0;
                      const hasReg = day.reg > 0;
                      const bg = total === 0
                        ? '#f2ebff'
                        : hasFun && hasReg
                          ? '#c084a0'
                          : hasFun
                            ? `rgba(255, 138, 128, ${intensity})`
                            : `rgba(78, 205, 196, ${intensity})`;
                      const isSelected = selectedDay === day.dateStr;
                      return (
                        <Pressable
                          key={di}
                          style={[s.calDay, { backgroundColor: bg }, isSelected && s.calDaySelected]}
                          onPress={() => setSelectedDay(isSelected ? null : day.dateStr)}
                        >
                          <Text style={[s.calDayNum, total > 0 && s.calDayNumSpent]}>{day.dayNum}</Text>
                          {total > 0 && <Text style={s.calDayAmt}>₪{Math.round(total)}</Text>}
                        </Pressable>
                      );
                    })}
                  </View>
                ));
              })()}
            </View>

            {/* Selected day detail */}
            {selectedDay ? (() => {
              const day = dailyData.find(d => d.dateStr === selectedDay);
              if (!day) return null;
              const funItems = month.funExpenses.filter(e => e.createdAt.slice(0, 10) === selectedDay);
              const regItems = month.regExpenses.filter(e => e.createdAt.slice(0, 10) === selectedDay);
              return (
                <View style={s.card}>
                  <Text style={s.title}>{day.label}</Text>
                  {funItems.length === 0 && regItems.length === 0 && (
                    <Text style={s.subtitle}>Nothing spent on this day.</Text>
                  )}
                  {funItems.length > 0 && (
                    <>
                      <Text style={s.subheading}>🫙 Fun expenses</Text>
                      {funItems.map(e => {
                        const c = funCats.find(fc => fc.key === e.category);
                        return (
                          <View key={e.id} style={s.expenseRow}>
                            <View style={[s.expenseBar, { backgroundColor: c?.color ?? '#ff8a80' }]} />
                            <View style={s.expenseText}>
                              <Text style={s.expenseTitle}>{c?.label ?? 'Other'}</Text>
                              <Text style={s.subtitle}>{e.note || 'No note'}</Text>
                            </View>
                            <Text style={s.expenseAmount}>{fmt(e.amount)}</Text>
                          </View>
                        );
                      })}
                    </>
                  )}
                  {regItems.length > 0 && (
                    <>
                      <Text style={s.subheading}>💳 Regular expenses</Text>
                      {regItems.map(e => {
                        const c = regCats.find(rc => rc.key === e.category);
                        return (
                          <View key={e.id} style={s.expenseRow}>
                            <View style={[s.expenseBar, { backgroundColor: c?.color ?? '#4ecdc4' }]} />
                            <View style={s.expenseText}>
                              <Text style={s.expenseTitle}>{c?.label ?? 'Other'}</Text>
                              <Text style={s.subtitle}>{e.note || 'No note'}</Text>
                            </View>
                            <Text style={s.expenseAmount}>{fmt(e.amount)}</Text>
                          </View>
                        );
                      })}
                    </>
                  )}
                  {(day.fun > 0 || day.reg > 0) && (
                    <View style={[s.summaryRow, { backgroundColor: '#f4eeff' }]}>
                      <Text style={s.summaryLabel}>Total this day</Text>
                      <Text style={[s.summaryValue, { color: '#241042' }]}>{fmt(day.fun + day.reg)}</Text>
                    </View>
                  )}
                </View>
              );
            })() : null}

            {/* Bar chart */}
            <View style={s.card}>
              <Text style={s.title}>Daily totals chart</Text>
              <Text style={s.subtitle}>Each bar shows fun (pink) + regular (teal) spending. Scroll right to see the full month.</Text>
              <View style={s.calLegend}>
                <View style={s.calLegendItem}><View style={[s.calLegendDot, { backgroundColor: '#ff8a80' }]} /><Text style={s.calLegendText}>Fun</Text></View>
                <View style={s.calLegendItem}><View style={[s.calLegendDot, { backgroundColor: '#4ecdc4' }]} /><Text style={s.calLegendText}>Regular</Text></View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={s.chartWrap}>
                  {/* Y-axis labels */}
                  <View style={s.chartYAxis}>
                    {[1, 0.75, 0.5, 0.25, 0].map(frac => (
                      <Text key={frac} style={s.chartYLabel}>₪{Math.round(maxDayTotal * frac)}</Text>
                    ))}
                  </View>
                  {/* Bars */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ flex: 1 }}>
                    <View style={s.chartBars}>
                      {dailyData.map(day => {
                        const total = day.fun + day.reg;
                        const funH  = maxDayTotal > 0 ? (day.fun / maxDayTotal) * 140 : 0;
                        const regH  = maxDayTotal > 0 ? (day.reg / maxDayTotal) * 140 : 0;
                        const isSelected = selectedDay === day.dateStr;
                        return (
                          <Pressable key={day.dateStr} style={s.chartBarWrap} onPress={() => setSelectedDay(isSelected ? null : day.dateStr)}>
                            <View style={s.chartBarColumn}>
                              {total === 0
                                ? <View style={[s.chartBarSegment, { height: 3, backgroundColor: '#e8e0f0' }]} />
                                : <>
                                    {day.reg > 0 && <View style={[s.chartBarSegment, { height: regH, backgroundColor: '#4ecdc4' }]} />}
                                    {day.fun > 0 && <View style={[s.chartBarSegment, { height: funH, backgroundColor: '#ff8a80' }]} />}
                                  </>
                              }
                            </View>
                            <Text style={[s.chartBarLabel, isSelected && s.chartBarLabelActive]}>{day.dayNum}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              </ScrollView>
            </View>
          </>
        ) : null}

        {/* ═══════════════════════ HISTORY TAB ═══════════════════════ */}
        {screen === 'history' ? (
          <>
            <View style={s.card}>
              <Text style={s.title}>Month-by-month history</Text>
              <Text style={s.subtitle}>Your income, regular expenses, and fun budget — every month in one place.</Text>
              <Pressable onPress={shareCsv} style={s.secondaryButton}><Text style={s.secondaryButtonText}>Share CSV</Text></Pressable>
            </View>
            {Object.entries(months).sort(([a],[b]) => b.localeCompare(a)).map(([mk, v]) => {
              const fSpent = v.funExpenses.reduce((sum, e) => sum + e.amount, 0);
              const inc    = (v.income ?? []).reduce((sum, e) => sum + e.amount, 0);
              const rSpent = (v.regExpenses ?? []).reduce((sum, e) => sum + e.amount, 0);
              const disp   = inc - rSpent;
              return (
                <View key={mk} style={s.card}>
                  <View style={s.historyHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.title}>{getMonthLabel(mk)}</Text>
                      <Text style={s.subtitle}>{getPeriodLabel(mk)}</Text>
                    </View>
                    <Pressable onPress={() => { setSelKey(mk); setScreen('jar'); }} style={s.secondaryButton}>
                      <Text style={s.secondaryButtonText}>Open</Text>
                    </Pressable>
                  </View>
                  <View style={s.row}>
                    <View style={[s.stat, { backgroundColor: '#b7f7cb' }]}>
                      <Text style={s.statLabel}>Income</Text>
                      <Text style={s.statValue}>{fmt(inc)}</Text>
                    </View>
                    <View style={[s.stat, { backgroundColor: '#ffb3c7' }]}>
                      <Text style={s.statLabel}>Regular exp.</Text>
                      <Text style={s.statValue}>{fmt(rSpent)}</Text>
                    </View>
                  </View>
                  <View style={[s.summaryRow, { backgroundColor: disp >= 0 ? '#e8f5e9' : '#fce4ec' }]}>
                    <Text style={s.summaryLabel}>Disposable income</Text>
                    <Text style={[s.summaryValue, { color: disp >= 0 ? '#2c7a3b' : '#d14a76' }]}>{fmt(disp)}</Text>
                  </View>
                  <View style={s.row}>
                    <View style={[s.stat, { backgroundColor: '#ffe38a' }]}>
                      <Text style={s.statLabel}>Fun budget</Text>
                      <Text style={s.statValue}>{fmt(v.funBudget)}</Text>
                    </View>
                    <View style={[s.stat, { backgroundColor: '#f8b4cc' }]}>
                      <Text style={s.statLabel}>Fun spent</Text>
                      <Text style={s.statValue}>{fmt(fSpent)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#24134d' },
  content:  { padding: 20, paddingBottom: 40, gap: 16, backgroundColor: '#24134d' },
  hero:     { backgroundColor: '#ff5d8f', borderRadius: 28, padding: 24 },
  brand:    { color: '#fff2a8', fontWeight: '800', marginBottom: 8, textTransform: 'uppercase' },
  heroTitle:{ color: '#fff', fontSize: 24, fontWeight: '900', lineHeight: 30 },
  // Tabs
  tabs:    { flexDirection: 'row', backgroundColor: '#3a236f', borderRadius: 999, padding: 6 },
  tab:     { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 999 },
  tabActive:{ backgroundColor: '#ffe38a' },
  tabText: { color: '#e3d9ff', fontWeight: '800', fontSize: 12 },
  tabTextActive: { color: '#523300', fontSize: 12 },
  // Cards
  card:     { backgroundColor: '#fff8fe', borderRadius: 24, padding: 18, gap: 12 },
  title:    { color: '#241042', fontSize: 22, fontWeight: '800' },
  subheading:{ color: '#241042', fontSize: 16, fontWeight: '800' },
  subtitle: { color: '#6d5c85', fontSize: 14, lineHeight: 20 },
  // Month picker
  monthRow: { gap: 10, paddingRight: 10 },
  monthChip:{ backgroundColor: '#f2ebff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  monthChipActive: { backgroundColor: '#7c7cff' },
  monthText:{ color: '#402a66', fontWeight: '700' },
  monthTextActive: { color: '#fff' },
  // Jar
  jarWrap:  { alignItems: 'center', paddingVertical: 8 },
  jarLid:   { width: 176, height: 26, borderRadius: 16, backgroundColor: '#ff5d8f', marginBottom: -4, zIndex: 2 },
  jarGlass: { width: 220, height: 300, borderRadius: 60, borderWidth: 6, borderColor: '#b8a0e8', backgroundColor: 'rgba(180,210,255,0.15)', overflow: 'hidden', justifyContent: 'flex-end' },
  jarFill:  { position: 'absolute', bottom: 0, left: 12, right: 12, borderRadius: 40, backgroundColor: '#7fe7a3' },
  jarBill:  { position: 'absolute', width: 70, height: 36, borderRadius: 8, backgroundColor: '#d7ffd7', borderWidth: 2, borderColor: '#61b26b', justifyContent: 'center', alignItems: 'center' },
  jarBillL: { left: 18, bottom: 120 },
  jarBillR: { right: 18, bottom: 160 },
  jarBillText:  { color: '#2c7a3b', fontSize: 16, fontWeight: '900' },
  jarCoin:  { position: 'absolute', width: 40, height: 40, borderRadius: 999, backgroundColor: '#ffe38a', borderWidth: 2, borderColor: '#c9960a', justifyContent: 'center', alignItems: 'center' },
  jarCoinText:  { color: '#7a5c00', fontSize: 13, fontWeight: '900' },
  // Stats
  row:      { flexDirection: 'row', gap: 12 },
  stat:     { flex: 1, borderRadius: 20, padding: 16, minHeight: 90, justifyContent: 'space-between' },
  statLabel:{ color: '#3b234f', fontWeight: '700', fontSize: 13 },
  statValue:{ color: '#241042', fontSize: 20, fontWeight: '900' },
  // Summary rows (Life tab overview)
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 16, padding: 14 },
  summaryLabel: { color: '#241042', fontWeight: '700', fontSize: 15 },
  summaryValue: { fontSize: 20, fontWeight: '900' },
  // Chips & categories
  chipWrap:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryChip:{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  categoryText:{ color: '#402a66', fontWeight: '700' },
  categoryTextActive: { color: '#fff' },
  // Inputs & buttons
  input:  { backgroundColor: '#f2ebff', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, color: '#241042', fontSize: 16 },
  primaryButton: { backgroundColor: '#7c7cff', borderRadius: 18, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryButton: { alignSelf: 'flex-start', backgroundColor: '#f4eeff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryButtonStretch: { backgroundColor: '#f4eeff', borderRadius: 18, paddingVertical: 14, alignItems: 'center' },
  secondaryButtonText: { color: '#5a3f8a', fontWeight: '700' },
  quickChip: { backgroundColor: '#ffe38a', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  quickChipText: { color: '#5d3a00', fontWeight: '700' },
  setButton: { backgroundColor: '#7c7cff', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  halfBtn: { flex: 1, alignSelf: 'stretch' },
  // Savings toggle
  savingsToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f4eeff', borderRadius: 18, padding: 14 },
  savingsToggleActive: { backgroundColor: '#e0d4ff' },
  checkbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: '#b8a0e8', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  checkboxActive: { backgroundColor: '#7c7cff', borderColor: '#7c7cff' },
  checkboxText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  // Category rows
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f8f2ff', borderRadius: 18, padding: 12 },
  swatch: { width: 18, height: 18, borderRadius: 999 },
  categoryRowText: { flex: 1, color: '#241042', fontWeight: '700' },
  smallButton: { backgroundColor: '#e7deff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  smallButtonText: { color: '#5a3f8a', fontSize: 12, fontWeight: '700' },
  smallDanger: { backgroundColor: '#ffe5ec', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  smallDangerText: { color: '#d14a76', fontSize: 12, fontWeight: '700' },
  editorBox: { backgroundColor: '#f4eeff', borderRadius: 20, padding: 14, gap: 12 },
  colorDot: { width: 34, height: 34, borderRadius: 999 },
  colorDotActive: { borderWidth: 3, borderColor: '#241042' },
  // Category budget planning
  catBudgetRow: { gap: 8, paddingVertical: 4 },
  catBudgetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catBadge: { fontSize: 13, fontWeight: '800', color: '#241042' },
  // Category spending progress
  catSpendRow: { gap: 6, paddingVertical: 4 },
  progressTrack: { flexDirection: 'row', height: 10, borderRadius: 999, backgroundColor: '#f2ebff', overflow: 'hidden' },
  progressFill: { borderRadius: 999 },
  overBudgetText: { color: '#d14a76', fontSize: 12, fontWeight: '700' },
  // Expenses
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1eaff' },
  breakdownAmount: { color: '#241042', fontWeight: '800' },
  expenseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f8f2ff', borderRadius: 20, padding: 14 },
  expenseBar: { width: 14, height: 50, borderRadius: 999 },
  expenseText: { flex: 1, gap: 4 },
  expenseTitle: { color: '#241042', fontWeight: '800', fontSize: 16 },
  expenseSide: { alignItems: 'flex-end', gap: 6 },
  expenseAmount: { color: '#241042', fontWeight: '800' },
  deleteText: { color: '#d14a76', fontWeight: '700', fontSize: 13 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  // Calendar
  calLegend:      { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  calLegendItem:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  calLegendDot:   { width: 14, height: 14, borderRadius: 999 },
  calLegendText:  { color: '#6d5c85', fontSize: 13, fontWeight: '600' },
  calHeader:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  calHeaderText:  { flex: 1, textAlign: 'center', color: '#9d8ab5', fontSize: 11, fontWeight: '700' },
  calWeekRow:     { flexDirection: 'row', gap: 4, marginBottom: 4 },
  calDay:         { flex: 1, aspectRatio: 1, borderRadius: 10, justifyContent: 'center', alignItems: 'center', padding: 2 },
  calDaySelected: { borderWidth: 2, borderColor: '#7c7cff' },
  calDayEmpty:    { flex: 1, aspectRatio: 1 },
  calDayNum:      { fontSize: 12, fontWeight: '700', color: '#9d8ab5' },
  calDayNumSpent: { color: '#241042' },
  calDayAmt:      { fontSize: 9, fontWeight: '800', color: '#241042' },
  // Chart
  chartWrap:      { flexDirection: 'row', height: 200, alignItems: 'flex-end' },
  chartYAxis:     { width: 44, height: 180, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6, paddingBottom: 20 },
  chartYLabel:    { fontSize: 10, color: '#9d8ab5', fontWeight: '600' },
  chartBars:      { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingBottom: 20, paddingTop: 10 },
  chartBarWrap:   { alignItems: 'center', gap: 4 },
  chartBarColumn: { width: 22, justifyContent: 'flex-end', height: 140, gap: 1 },
  chartBarSegment:{ width: 22, borderRadius: 4 },
  chartBarLabel:  { fontSize: 10, color: '#9d8ab5', fontWeight: '600' },
  chartBarLabelActive: { color: '#7c7cff', fontWeight: '800' },
  // Loading
  loadingScreen: { flex: 1, backgroundColor: '#24134d' },
  loadingInner:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 14 },
  loadingBrand:  { color: '#fff2a8', fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  loadingTitle:  { color: '#fff', fontSize: 28, fontWeight: '900', lineHeight: 34, textAlign: 'center', maxWidth: 320 },
  loadingStage:  { width: 260, height: 350, justifyContent: 'flex-end', alignItems: 'center' },
  fallingMoney:  { position: 'absolute', width: 64, height: 34, borderRadius: 8, backgroundColor: '#d7ffd7', borderWidth: 2, borderColor: '#61b26b', justifyContent: 'center', alignItems: 'center' },
  fallingMoneyL: { left: 60, top: 20 },
  fallingMoneyR: { right: 60, top: 0 },
  fallingMoneyText: { color: '#2c7a3b', fontSize: 16, fontWeight: '900' },
  loadingLid:  { width: 150, height: 28, borderRadius: 18, backgroundColor: '#ff5d8f', marginBottom: -4 },
  loadingJar:  { width: 180, height: 230, borderRadius: 54, borderWidth: 6, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(189,234,255,0.16)', justifyContent: 'flex-end', overflow: 'hidden' },
  loadingFill: { marginHorizontal: 10, marginBottom: 10, height: 108, borderRadius: 34, backgroundColor: '#7fe7a3' },
});
