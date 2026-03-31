import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Category = { key: string; label: string; color: string };
type Expense = { id: string; amount: number; category: string; note: string; createdAt: string };
type MonthData = {
  budget: number;
  expenses: Expense[];
  savingsEnabled: boolean;
  savingsGoal: number;
  savingsSaved: number;
};
type StoredData = { categories: Category[]; months: Record<string, MonthData> };
type LegacyData = { monthKey: string; budget: number; expenses: Expense[] };
type ScreenMode = 'jar' | 'tracker' | 'history';

const STORAGE_KEY = 'dinis-money-jar-monthly-budget';
const DEFAULT_CATEGORIES: Category[] = [
  { key: 'food', label: 'Food', color: '#ff8a80' },
  { key: 'fun', label: 'Fun', color: '#ffd166' },
  { key: 'shopping', label: 'Shopping', color: '#7c7cff' },
  { key: 'transport', label: 'Transport', color: '#4ecdc4' },
  { key: 'other', label: 'Other', color: '#a78bfa' },
];
const COLOR_OPTIONS = ['#ff8a80', '#ffd166', '#7c7cff', '#4ecdc4', '#ff9f6e', '#2ec4b6', '#a78bfa', '#ff5d8f'];
const QUICK_BUDGETS = [250, 500, 750, 1000];
const QUICK_SAVINGS = [50, 100, 150, 250];

function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}`;
}

function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split('-').map(Number);
  return getMonthKey(new Date(year, month - 1 + delta, 1));
}

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function getTodayLabel(date = new Date()) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(value: number) {
  const abs = Math.abs(value).toFixed(2);
  return value < 0 ? `-\u20AA${abs}` : `\u20AA${abs}`;
}

function createEmptyMonth(): MonthData {
  return { budget: 0, expenses: [], savingsEnabled: false, savingsGoal: 0, savingsSaved: 0 };
}

function normalizeMonthData(value?: Partial<MonthData> & { savingsSetAside?: number }): MonthData {
  const legacySavings = value?.savingsSetAside ?? 0;
  return {
    budget: value?.budget ?? 0,
    expenses: value?.expenses ?? [],
    savingsEnabled: value?.savingsEnabled ?? false,
    savingsGoal: value?.savingsGoal ?? legacySavings,
    savingsSaved: value?.savingsSaved ?? legacySavings,
  };
}

function normalizeData(raw: string | null, currentMonthKey: string): StoredData {
  if (!raw) return { categories: DEFAULT_CATEGORIES, months: { [currentMonthKey]: createEmptyMonth() } };

  const parsed = JSON.parse(raw) as Partial<StoredData> & Partial<LegacyData>;
  if (parsed.categories && parsed.months) {
    const normalizedMonths = Object.fromEntries(
      Object.entries(parsed.months).map(([monthKey, value]) => [monthKey, normalizeMonthData(value)])
    );
    return {
      categories: parsed.categories.length ? parsed.categories : DEFAULT_CATEGORIES,
      months: Object.keys(normalizedMonths).length ? normalizedMonths : { [currentMonthKey]: createEmptyMonth() },
    };
  }

  if (parsed.monthKey) {
    return {
      categories: DEFAULT_CATEGORIES,
      months: {
        [parsed.monthKey]: {
          budget: parsed.budget ?? 0,
          expenses: parsed.expenses ?? [],
          savingsEnabled: false,
          savingsGoal: 0,
          savingsSaved: 0,
        },
      },
    };
  }

  return { categories: DEFAULT_CATEGORIES, months: { [currentMonthKey]: createEmptyMonth() } };
}

function LoadingScreen() {
  const jarY = useRef(new Animated.Value(0)).current;
  const moneyA = useRef(new Animated.Value(-80)).current;
  const moneyB = useRef(new Animated.Value(-120)).current;
  const opacityA = useRef(new Animated.Value(0)).current;
  const opacityB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(jarY, { toValue: -6, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(jarY, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    const dropA = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacityA, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.timing(moneyA, { toValue: 170, duration: 1050, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.timing(opacityA, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(moneyA, { toValue: -80, duration: 1, useNativeDriver: true }),
      ])
    );
    const dropB = Animated.loop(
      Animated.sequence([
        Animated.delay(280),
        Animated.parallel([
          Animated.timing(opacityB, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.timing(moneyB, { toValue: 170, duration: 1120, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.timing(opacityB, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(moneyB, { toValue: -120, duration: 1, useNativeDriver: true }),
      ])
    );
    bounce.start();
    dropA.start();
    dropB.start();
    return () => {
      bounce.stop();
      dropA.stop();
      dropB.stop();
    };
  }, [jarY, moneyA, moneyB, opacityA, opacityB]);

  return (
    <SafeAreaView style={styles.loadingScreen}>
      <StatusBar style="light" />
      <View style={styles.loadingInner}>
        <Text style={styles.loadingBrand}>Dini&apos;s Money Jar</Text>
        <Text style={styles.loadingTitle}>Coins are falling into the jar while your months wake up...</Text>
        <View style={styles.loadingStage}>
          <Animated.View style={[styles.fallingMoney, styles.fallingMoneyLeft, { opacity: opacityA, transform: [{ translateY: moneyA }, { rotate: '-10deg' }] }]}>
            <Text style={styles.fallingMoneyText}>{'\u20AA'}</Text>
          </Animated.View>
          <Animated.View style={[styles.fallingMoney, styles.fallingMoneyRight, { opacity: opacityB, transform: [{ translateY: moneyB }, { rotate: '8deg' }] }]}>
            <Text style={styles.fallingMoneyText}>{'\u20AA'}</Text>
          </Animated.View>
          <Animated.View style={{ transform: [{ translateY: jarY }] }}>
            <View style={styles.loadingJarLid} />
            <View style={styles.loadingJar}>
              <View style={styles.loadingJarFill} />
            </View>
          </Animated.View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function JarGraphic({ fillAnim, hasBudget, isOverBudget }: { fillAnim: Animated.Value; hasBudget: boolean; isOverBudget: boolean }) {
  return (
    <View style={styles.jarGraphicWrap}>
      <View style={styles.jarShadow} />
      <View style={styles.jarLid} />
      <View style={styles.jarGlass}>
        <Animated.View style={[styles.jarFill, isOverBudget && styles.jarFillOver, { height: fillAnim }]} />
        <View style={styles.jarHighlight} />
        {hasBudget ? (
          <>
            <View style={[styles.jarBill, styles.jarBillOne]} />
            <View style={[styles.jarBill, styles.jarBillTwo]} />
            <View style={[styles.jarCoin, styles.jarCoinOne]} />
            <View style={[styles.jarCoin, styles.jarCoinTwo]} />
            <View style={[styles.jarCoin, styles.jarCoinThree]} />
          </>
        ) : (
          <Text style={styles.jarEmptyText}>Set a budget to fill your jar</Text>
        )}
      </View>
    </View>
  );
}

export default function App() {
  const currentMonthKey = getMonthKey();
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [months, setMonths] = useState<Record<string, MonthData>>({ [currentMonthKey]: createEmptyMonth() });
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);
  const [screenMode, setScreenMode] = useState<ScreenMode>('jar');
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_CATEGORIES[0].key);
  const [budgetInput, setBudgetInput] = useState('');
  const [savingsGoalInput, setSavingsGoalInput] = useState('');
  const [savingsAddInput, setSavingsAddInput] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_OPTIONS[0]);
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [ready, setReady] = useState(false);
  const jarFill = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    let mounted = true;
    async function load() {
      const started = Date.now();
      const normalized = normalizeData(await AsyncStorage.getItem(STORAGE_KEY), currentMonthKey);
      const wait = Math.max(0, 1700 - (Date.now() - started));
      await new Promise((resolve) => setTimeout(resolve, wait));
      if (!mounted) return;
      setCategories(normalized.categories);
      setMonths(normalized.months);
      setSelectedCategory(normalized.categories[0]?.key ?? DEFAULT_CATEGORIES[0].key);
      setReady(true);
    }
    load().catch(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, [currentMonthKey]);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ categories, months })).catch(() => {
      Alert.alert('Storage issue', 'We could not save your latest changes.');
    });
  }, [categories, months, ready]);

  const month = months[selectedMonthKey] ?? createEmptyMonth();
  const spent = month.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const leftToSpend = month.budget - spent;
  const isOverBudget = leftToSpend < 0;
  const spendingProgress = month.budget > 0 ? Math.min(spent / month.budget, 1) : 0;
  const savingsProgress = month.savingsGoal > 0 ? Math.min(month.savingsSaved / month.savingsGoal, 1) : 0;
  const fillHeight = month.budget > 0 ? 24 + Math.max(0, Math.min(leftToSpend / month.budget, 1)) * 250 : 24;

  useEffect(() => {
    setBudgetInput(month.budget ? `${month.budget}` : '');
    setSavingsGoalInput(month.savingsGoal ? `${month.savingsGoal}` : '');
    setSavingsAddInput('');
  }, [month.budget, month.savingsGoal, selectedMonthKey]);

  useEffect(() => {
    if (!categories.some((category) => category.key === selectedCategory)) {
      setSelectedCategory(categories[0]?.key ?? DEFAULT_CATEGORIES[0].key);
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    Animated.spring(jarFill, { toValue: fillHeight, friction: 10, tension: 60, useNativeDriver: false }).start();
  }, [fillHeight, jarFill]);

  const monthOptions = useMemo(() => {
    const keys = new Set(Object.keys(months));
    for (let index = -4; index <= 7; index += 1) keys.add(shiftMonth(currentMonthKey, index));
    return Array.from(keys).sort();
  }, [currentMonthKey, months]);

  const categoryTotals = useMemo(
    () =>
      categories
        .map((category) => ({
          ...category,
          total: month.expenses.filter((expense) => expense.category === category.key).reduce((sum, expense) => sum + expense.amount, 0),
        }))
        .filter((entry) => entry.total > 0)
        .sort((left, right) => right.total - left.total),
    [categories, month.expenses]
  );

  const historyRows = useMemo(
    () =>
      Object.entries(months)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([monthKey, value]) => {
          const monthSpent = value.expenses.reduce((sum, expense) => sum + expense.amount, 0);
          return {
            monthKey,
            label: getMonthLabel(monthKey),
            budget: value.budget,
            spent: monthSpent,
            saved: value.savingsSaved,
            savingsGoal: value.savingsGoal,
            remaining: value.budget - monthSpent,
            breakdown: categories
              .map((category) => ({
                label: category.label,
                total: value.expenses.filter((expense) => expense.category === category.key).reduce((sum, expense) => sum + expense.amount, 0),
              }))
              .filter((entry) => entry.total > 0)
              .sort((left, right) => right.total - left.total),
          };
        }),
    [categories, months]
  );

  const csvText = useMemo(() => {
    const rows = historyRows.map(
      (row) =>
        `${row.label},${row.budget.toFixed(2)},${row.spent.toFixed(2)},${row.saved.toFixed(2)},${row.savingsGoal.toFixed(2)},${row.remaining.toFixed(2)},${row.breakdown
          .map((entry) => `${entry.label}: ${entry.total.toFixed(2)}`)
          .join(' | ')}`
    );
    return ['Month,Budget,Spent,Saved,Savings Goal,Left To Spend,Categories', ...rows].join('\n');
  }, [historyRows]);

  function updateMonth(nextMonth: MonthData) {
    setMonths((current) => ({ ...current, [selectedMonthKey]: nextMonth }));
  }

  function saveBudget() {
    const parsed = Number.parseFloat(budgetInput);
    if (Number.isNaN(parsed) || parsed <= 0) {
      Alert.alert('Enter a budget', 'Choose how much spending money you have for this month.');
      return;
    }
    if (month.budget > 0 && parsed > month.budget) {
      Alert.alert('Budget locked', 'Once you set a monthly budget, you can keep it the same or lower it, but not raise it.');
      return;
    }
    updateMonth({ ...month, budget: parsed });
  }

  function toggleSavings() {
    if (month.savingsEnabled) {
      updateMonth({ ...month, savingsEnabled: false, savingsGoal: 0, savingsSaved: 0 });
      setSavingsGoalInput('');
      setSavingsAddInput('');
      return;
    }
    updateMonth({ ...month, savingsEnabled: true });
  }

  function saveSavingsGoal() {
    if (!month.savingsEnabled) return;
    const parsed = Number.parseFloat(savingsGoalInput);
    if (Number.isNaN(parsed) || parsed < 0) {
      Alert.alert('Enter savings target', 'Add the amount you want to put aside this month.');
      return;
    }
    updateMonth({ ...month, savingsGoal: parsed });
  }

  function addSavings() {
    if (!month.savingsEnabled) return;
    const parsed = Number.parseFloat(savingsAddInput);
    if (Number.isNaN(parsed) || parsed <= 0) {
      Alert.alert('Enter saved amount', 'Add how much you tucked away this time.');
      return;
    }
    updateMonth({ ...month, savingsSaved: month.savingsSaved + parsed });
    setSavingsAddInput('');
  }

  function addExpense() {
    const parsed = Number.parseFloat(expenseAmount);
    if (Number.isNaN(parsed) || parsed <= 0) {
      Alert.alert('Enter an amount', 'Add how much you spent before saving the expense.');
      return;
    }
    updateMonth({
      ...month,
      expenses: [
        { id: `${Date.now()}`, amount: parsed, category: selectedCategory, note: expenseNote.trim(), createdAt: new Date().toISOString() },
        ...month.expenses,
      ],
    });
    setExpenseAmount('');
    setExpenseNote('');
    setScreenMode('jar');
  }

  function deleteExpense(id: string) {
    updateMonth({ ...month, expenses: month.expenses.filter((expense) => expense.id !== id) });
  }

  function resetMonth() {
    Alert.alert('Reset this month?', 'This clears the current budget, savings, and expenses for this month only.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => updateMonth(createEmptyMonth()) },
    ]);
  }

  function addCategory() {
    const trimmed = newCategoryLabel.trim();
    if (!trimmed) return;
    const base = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const key = categories.some((category) => category.key === base) ? `${base}-${Date.now()}` : base;
    setCategories((current) => [...current, { key, label: trimmed, color: newCategoryColor }]);
    setSelectedCategory(key);
    setNewCategoryLabel('');
  }

  function saveRename() {
    if (!renameKey || !renameValue.trim()) return;
    setCategories((current) => current.map((category) => (category.key === renameKey ? { ...category, label: renameValue.trim() } : category)));
    setRenameKey(null);
    setRenameValue('');
  }

  function removeCategory(key: string) {
    if (categories.length <= 1) return;
    const fallback = categories.find((category) => category.key !== key);
    if (!fallback) return;
    setCategories((current) => current.filter((category) => category.key !== key));
    setMonths((current) => {
      const next: Record<string, MonthData> = {};
      Object.entries(current).forEach(([monthKey, value]) => {
        next[monthKey] = {
          ...value,
          expenses: value.expenses.map((expense) => (expense.category === key ? { ...expense, category: fallback.key } : expense)),
        };
      });
      return next;
    });
    if (selectedCategory === key) setSelectedCategory(fallback.key);
  }

  async function shareCsv() {
    await Share.share({ message: csvText, title: "Dini's Money Jar export" });
  }

  if (!ready) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <Text style={styles.brand}>Dini&apos;s Money Jar</Text>
              <Text style={styles.heroTitle}>{getTodayLabel()}</Text>
              <Text style={styles.heroSubtitle}>Your spending budget stays locked for the month, while savings get tracked separately in their own cute jar plan.</Text>
            </View>
            <Image source={require('./assets/icon.png')} style={styles.heroIcon} resizeMode="contain" />
          </View>
        </View>

        <View style={styles.tabs}>
          {(['jar', 'tracker', 'history'] as ScreenMode[]).map((mode) => (
            <Pressable key={mode} onPress={() => setScreenMode(mode)} style={[styles.tab, screenMode === mode && styles.tabActive]}>
              <Text style={[styles.tabText, screenMode === mode && styles.tabTextActive]}>{mode === 'jar' ? 'Jar' : mode === 'tracker' ? 'Tracker' : 'History'}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Month</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthRow}>
            {monthOptions.map((monthKey) => (
              <Pressable key={monthKey} onPress={() => setSelectedMonthKey(monthKey)} style={[styles.monthChip, selectedMonthKey === monthKey && styles.monthChipActive]}>
                <Text style={[styles.monthText, selectedMonthKey === monthKey && styles.monthTextActive]}>{getMonthLabel(monthKey)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {screenMode === 'jar' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.title}>Money jar</Text>
              <Text style={styles.subtitle}>Watching {getMonthLabel(selectedMonthKey)}. This jar drains only when you spend your budget.</Text>
              <JarGraphic fillAnim={jarFill} hasBudget={month.budget > 0} isOverBudget={isOverBudget} />
              <View style={styles.row}>
                <View style={[styles.stat, { backgroundColor: '#ffb3c7' }]}>
                  <Text style={styles.statLabel}>Spent</Text>
                  <Text style={styles.statValue}>{formatCurrency(spent)}</Text>
                </View>
                <View style={[styles.stat, { backgroundColor: '#b7f7cb' }]}>
                  <Text style={styles.statLabel}>Left to spend</Text>
                  <Text style={[styles.statValue, isOverBudget && styles.overBudgetText]}>{formatCurrency(leftToSpend)}</Text>
                </View>
              </View>
              <View style={[styles.stat, styles.singleStat, { backgroundColor: '#ffe38a' }]}>
                <Text style={styles.statLabel}>Savings tucked away this month</Text>
                <Text style={styles.statValue}>{formatCurrency(month.savingsSaved)}</Text>
              </View>
              <View style={styles.progressBlock}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressLabel}>Budget used</Text>
                  <Text style={styles.progressValue}>{Math.round(spendingProgress * 100)}%</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, isOverBudget && styles.progressFillOver, { width: `${Math.min(spendingProgress * 100, 100)}%` }]} />
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Quick spend</Text>
              <View style={styles.chipWrap}>
                {categories.map((category) => (
                  <Pressable key={category.key} onPress={() => setSelectedCategory(category.key)} style={[styles.categoryChip, { backgroundColor: selectedCategory === category.key ? category.color : '#f2ebff' }]}>
                    <Text style={[styles.categoryText, selectedCategory === category.key && styles.categoryTextActive]}>{category.label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput style={styles.input} value={expenseAmount} onChangeText={setExpenseAmount} keyboardType="decimal-pad" placeholder="How much did you spend?" placeholderTextColor="#7d6b91" />
              <TextInput style={styles.input} value={expenseNote} onChangeText={setExpenseNote} placeholder="Quick note" placeholderTextColor="#7d6b91" />
              <Pressable onPress={addExpense} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Add expense</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {screenMode === 'tracker' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.title}>Monthly budget</Text>
              <Pressable onPress={resetMonth} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Reset month</Text>
              </Pressable>
              <Text style={styles.subtitle}>
                {month.budget > 0
                  ? `This month is locked at ${formatCurrency(month.budget)} unless you want to lower it.`
                  : 'Pick your spending money for this month. Once saved, you can lower it later but not raise it.'}
              </Text>
              <TextInput style={styles.input} value={budgetInput} onChangeText={setBudgetInput} keyboardType="decimal-pad" placeholder="Example: 650" placeholderTextColor="#7d6b91" />
              <View style={styles.chipWrap}>
                {QUICK_BUDGETS.map((amount) => (
                  <Pressable key={amount} onPress={() => setBudgetInput(`${amount}`)} style={styles.quickChip}>
                    <Text style={styles.quickChipText}>{formatCurrency(amount)}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={saveBudget} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{month.budget > 0 ? 'Save lower budget' : 'Save budget'}</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Savings jar</Text>
              <Pressable onPress={toggleSavings} style={[styles.savingsToggle, month.savingsEnabled && styles.savingsToggleActive]}>
                <View style={[styles.checkbox, month.savingsEnabled && styles.checkboxActive]}>
                  {month.savingsEnabled ? <Text style={styles.checkboxText}>✓</Text> : null}
                </View>
                <View style={styles.savingsCopy}>
                  <Text style={styles.subheading}>I&apos;m putting money aside this month</Text>
                  <Text style={styles.subtitle}>This does not lower your spending budget. It only tracks savings separately.</Text>
                </View>
              </Pressable>
              {month.savingsEnabled ? (
                <>
                  <TextInput style={styles.input} value={savingsGoalInput} onChangeText={setSavingsGoalInput} keyboardType="decimal-pad" placeholder="Monthly savings plan" placeholderTextColor="#7d6b91" />
                  <View style={styles.chipWrap}>
                    {QUICK_SAVINGS.map((amount) => (
                      <Pressable key={amount} onPress={() => setSavingsGoalInput(`${amount}`)} style={styles.quickChip}>
                        <Text style={styles.quickChipText}>{formatCurrency(amount)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable onPress={saveSavingsGoal} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>Save monthly savings plan</Text>
                  </Pressable>
                  <TextInput style={styles.input} value={savingsAddInput} onChangeText={setSavingsAddInput} keyboardType="decimal-pad" placeholder="How much did you save today?" placeholderTextColor="#7d6b91" />
                  <Pressable onPress={addSavings} style={styles.secondaryButtonStretch}>
                    <Text style={styles.secondaryButtonText}>Add to savings total</Text>
                  </Pressable>
                  <View style={styles.row}>
                    <View style={[styles.stat, { backgroundColor: '#ffe38a' }]}>
                      <Text style={styles.statLabel}>Monthly goal</Text>
                      <Text style={styles.statValue}>{formatCurrency(month.savingsGoal)}</Text>
                    </View>
                    <View style={[styles.stat, { backgroundColor: '#b7f7cb' }]}>
                      <Text style={styles.statLabel}>Saved so far</Text>
                      <Text style={styles.statValue}>{formatCurrency(month.savingsSaved)}</Text>
                    </View>
                  </View>
                  <View style={styles.progressBlock}>
                    <View style={styles.progressHeader}>
                      <Text style={styles.progressLabel}>Savings goal progress</Text>
                      <Text style={styles.progressValue}>{Math.round(savingsProgress * 100)}%</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, styles.savingsProgressFill, { width: `${Math.min(savingsProgress * 100, 100)}%` }]} />
                    </View>
                  </View>
                </>
              ) : (
                <Text style={styles.subtitle}>Turn this on whenever you want to track money you set aside in addition to your spending budget.</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>This month by category</Text>
              {categoryTotals.length === 0 ? (
                <Text style={styles.subtitle}>Add an expense to see what you spent money on this month.</Text>
              ) : (
                categoryTotals.map((entry) => (
                  <View key={entry.key} style={styles.breakdownRow}>
                    <View style={[styles.swatch, { backgroundColor: entry.color }]} />
                    <Text style={styles.categoryRowText}>{entry.label}</Text>
                    <Text style={styles.breakdownAmount}>{formatCurrency(entry.total)}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Edit categories</Text>
              {categories.map((category) => (
                <View key={category.key} style={styles.categoryRow}>
                  <View style={[styles.swatch, { backgroundColor: category.color }]} />
                  <Text style={styles.categoryRowText}>{category.label}</Text>
                  <View style={styles.categoryActions}>
                    <Pressable onPress={() => { setRenameKey(category.key); setRenameValue(category.label); }} style={styles.smallButton}>
                      <Text style={styles.smallButtonText}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => removeCategory(category.key)} style={styles.smallDanger}>
                      <Text style={styles.smallDangerText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {renameKey ? (
                <View style={styles.editorBox}>
                  <TextInput style={styles.input} value={renameValue} onChangeText={setRenameValue} placeholder="Rename category" placeholderTextColor="#7d6b91" />
                  <View style={styles.row}>
                    <Pressable onPress={saveRename} style={[styles.primaryButton, styles.halfButton]}>
                      <Text style={styles.primaryButtonText}>Save</Text>
                    </Pressable>
                    <Pressable onPress={() => { setRenameKey(null); setRenameValue(''); }} style={[styles.secondaryButtonStretch, styles.halfButton]}>
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
              <View style={styles.editorBox}>
                <TextInput style={styles.input} value={newCategoryLabel} onChangeText={setNewCategoryLabel} placeholder="New category" placeholderTextColor="#7d6b91" />
                <View style={styles.chipWrap}>
                  {COLOR_OPTIONS.map((color) => (
                    <Pressable key={color} onPress={() => setNewCategoryColor(color)} style={[styles.colorDot, { backgroundColor: color }, newCategoryColor === color && styles.colorDotActive]} />
                  ))}
                </View>
                <Pressable onPress={addCategory} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Add category</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Recent spending</Text>
              {month.expenses.length === 0 ? (
                <Text style={styles.subtitle}>No expenses in this month yet.</Text>
              ) : (
                month.expenses.map((expense) => {
                  const category = categories.find((entry) => entry.key === expense.category);
                  return (
                    <View key={expense.id} style={styles.expenseRow}>
                      <View style={[styles.expenseBar, { backgroundColor: category?.color ?? '#a78bfa' }]} />
                      <View style={styles.expenseText}>
                        <Text style={styles.expenseTitle}>{category?.label ?? 'Other'}</Text>
                        <Text style={styles.subtitle}>{expense.note || 'No note'} {'\u2022'} {new Date(expense.createdAt).toLocaleDateString('en-US')}</Text>
                      </View>
                      <View style={styles.expenseSide}>
                        <Text style={styles.expenseAmount}>{formatCurrency(expense.amount)}</Text>
                        <Pressable onPress={() => deleteExpense(expense.id)}>
                          <Text style={styles.deleteText}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        ) : null}

        {screenMode === 'history' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.title}>Month-by-month history</Text>
              <Text style={styles.subtitle}>See how much you spent, how much you saved, what you spent it on, and export it like a spreadsheet.</Text>
              <Pressable onPress={shareCsv} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Share CSV</Text>
              </Pressable>
            </View>

            {historyRows.map((row) => (
              <View key={row.monthKey} style={styles.card}>
                <View style={styles.historyHeader}>
                  <View>
                    <Text style={styles.title}>{row.label}</Text>
                    <Text style={styles.subtitle}>{formatCurrency(row.spent)} spent, {formatCurrency(row.saved)} saved</Text>
                  </View>
                  <Pressable onPress={() => setSelectedMonthKey(row.monthKey)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Open month</Text>
                  </Pressable>
                </View>
                <View style={styles.row}>
                  <View style={[styles.stat, { backgroundColor: '#ffe38a' }]}>
                    <Text style={styles.statLabel}>Budget</Text>
                    <Text style={styles.statValue}>{formatCurrency(row.budget)}</Text>
                  </View>
                  <View style={[styles.stat, { backgroundColor: '#ffb3c7' }]}>
                    <Text style={styles.statLabel}>Spent</Text>
                    <Text style={styles.statValue}>{formatCurrency(row.spent)}</Text>
                  </View>
                </View>
                <View style={styles.row}>
                  <View style={[styles.stat, { backgroundColor: '#b7f7cb' }]}>
                    <Text style={styles.statLabel}>Saved</Text>
                    <Text style={styles.statValue}>{formatCurrency(row.saved)}</Text>
                  </View>
                  <View style={[styles.stat, { backgroundColor: '#d8cbff' }]}>
                    <Text style={styles.statLabel}>Left to spend</Text>
                    <Text style={styles.statValue}>{formatCurrency(row.remaining)}</Text>
                  </View>
                </View>
                <View style={[styles.stat, styles.singleStat, { backgroundColor: '#f4eeff' }]}>
                  <Text style={styles.statLabel}>Savings plan</Text>
                  <Text style={styles.statValue}>{formatCurrency(row.savingsGoal)}</Text>
                </View>
                <Text style={styles.subheading}>Spent on what</Text>
                {row.breakdown.length === 0 ? (
                  <Text style={styles.subtitle}>No spending recorded in this month yet.</Text>
                ) : (
                  row.breakdown.map((entry) => (
                    <View key={`${row.monthKey}-${entry.label}`} style={styles.breakdownRow}>
                      <Text style={styles.categoryRowText}>{entry.label}</Text>
                      <Text style={styles.breakdownAmount}>{formatCurrency(entry.total)}</Text>
                    </View>
                  ))
                )}
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#24134d' },
  content: { padding: 20, paddingBottom: 40, gap: 16, backgroundColor: '#24134d' },
  hero: { backgroundColor: '#ff5d8f', borderRadius: 28, padding: 24, shadowColor: '#110320', shadowOpacity: 0.24, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  heroTopRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  heroCopy: { flex: 1, gap: 8 },
  heroIcon: { width: 82, height: 82, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.22)' },
  brand: { color: '#fff2a8', fontWeight: '800', textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '900', lineHeight: 32 },
  heroSubtitle: { color: '#ffe6f0', fontSize: 14, lineHeight: 20 },
  tabs: { flexDirection: 'row', backgroundColor: '#3a236f', borderRadius: 999, padding: 6 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 999 },
  tabActive: { backgroundColor: '#ffe38a' },
  tabText: { color: '#e3d9ff', fontWeight: '800' },
  tabTextActive: { color: '#523300' },
  card: { backgroundColor: '#fff8fe', borderRadius: 24, padding: 18, gap: 12 },
  title: { color: '#241042', fontSize: 22, fontWeight: '800' },
  subheading: { color: '#241042', fontSize: 16, fontWeight: '800' },
  subtitle: { color: '#6d5c85', fontSize: 14, lineHeight: 20 },
  monthRow: { gap: 10, paddingRight: 10 },
  monthChip: { backgroundColor: '#f2ebff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  monthChipActive: { backgroundColor: '#7c7cff' },
  monthText: { color: '#402a66', fontWeight: '700' },
  monthTextActive: { color: '#fff' },
  jarGraphicWrap: { alignItems: 'center', paddingVertical: 8 },
  jarShadow: { position: 'absolute', bottom: 8, width: 170, height: 24, borderRadius: 999, backgroundColor: 'rgba(36,16,66,0.12)' },
  jarLid: { width: 170, height: 30, borderRadius: 20, backgroundColor: '#ff7cad', marginBottom: -8, zIndex: 2 },
  jarGlass: { width: 220, height: 300, borderRadius: 60, borderWidth: 6, borderColor: 'rgba(255,255,255,0.72)', backgroundColor: 'rgba(177,234,255,0.2)', overflow: 'hidden', justifyContent: 'flex-end' },
  jarFill: { position: 'absolute', left: 12, right: 12, bottom: 12, borderRadius: 40, backgroundColor: '#7fe7a3' },
  jarFillOver: { backgroundColor: '#ff9bb7' },
  jarHighlight: { position: 'absolute', left: 28, top: 28, width: 34, height: 190, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.22)' },
  jarBill: { position: 'absolute', width: 74, height: 26, borderRadius: 8, backgroundColor: '#d5ffd8', borderWidth: 2, borderColor: '#69b574' },
  jarBillOne: { right: 34, bottom: 86, transform: [{ rotate: '-11deg' }] },
  jarBillTwo: { left: 42, bottom: 118, transform: [{ rotate: '8deg' }] },
  jarCoin: { position: 'absolute', width: 28, height: 28, borderRadius: 999, backgroundColor: '#ffe38a', borderWidth: 2, borderColor: '#d7ad34' },
  jarCoinOne: { left: 50, bottom: 56 },
  jarCoinTwo: { left: 92, bottom: 44 },
  jarCoinThree: { right: 48, bottom: 54 },
  jarEmptyText: { position: 'absolute', top: 126, left: 42, right: 42, textAlign: 'center', color: '#5d5187', fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, borderRadius: 20, padding: 16, minHeight: 100, justifyContent: 'space-between' },
  singleStat: { minHeight: 84 },
  statLabel: { color: '#3b234f', fontWeight: '700' },
  statValue: { color: '#241042', fontSize: 26, fontWeight: '900' },
  overBudgetText: { color: '#d14a76' },
  progressBlock: { gap: 8 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { color: '#3b234f', fontWeight: '700' },
  progressValue: { color: '#241042', fontWeight: '900' },
  progressTrack: { height: 10, backgroundColor: '#ebe3ff', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#7c7cff' },
  progressFillOver: { backgroundColor: '#d14a76' },
  savingsProgressFill: { backgroundColor: '#44c980' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  categoryText: { color: '#402a66', fontWeight: '700' },
  categoryTextActive: { color: '#fff' },
  input: { backgroundColor: '#f2ebff', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, color: '#241042', fontSize: 16 },
  primaryButton: { backgroundColor: '#7c7cff', borderRadius: 18, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryButton: { alignSelf: 'flex-start', backgroundColor: '#f4eeff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryButtonStretch: { backgroundColor: '#f4eeff', borderRadius: 18, paddingVertical: 14, alignItems: 'center' },
  secondaryButtonText: { color: '#5a3f8a', fontWeight: '700' },
  quickChip: { backgroundColor: '#ffe38a', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  quickChipText: { color: '#5d3a00', fontWeight: '700' },
  savingsToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f8f2ff', borderRadius: 18, padding: 12 },
  savingsToggleActive: { backgroundColor: '#efe6ff' },
  checkbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: '#8d79b8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxActive: { backgroundColor: '#7c7cff', borderColor: '#7c7cff' },
  checkboxText: { color: '#fff', fontWeight: '900' },
  savingsCopy: { flex: 1, gap: 2 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f8f2ff', borderRadius: 18, padding: 12, flexWrap: 'wrap' },
  swatch: { width: 18, height: 18, borderRadius: 999 },
  categoryRowText: { flex: 1, color: '#241042', fontWeight: '700' },
  categoryActions: { flexDirection: 'row', gap: 8 },
  smallButton: { backgroundColor: '#e7deff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  smallButtonText: { color: '#5a3f8a', fontSize: 12, fontWeight: '700' },
  smallDanger: { backgroundColor: '#ffe5ec', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  smallDangerText: { color: '#d14a76', fontSize: 12, fontWeight: '700' },
  editorBox: { backgroundColor: '#f4eeff', borderRadius: 20, padding: 14, gap: 12 },
  halfButton: { flex: 1, alignSelf: 'stretch' },
  colorDot: { width: 34, height: 34, borderRadius: 999 },
  colorDotActive: { borderWidth: 3, borderColor: '#241042' },
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
  loadingScreen: { flex: 1, backgroundColor: '#24134d' },
  loadingInner: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 14 },
  loadingBrand: { color: '#fff2a8', fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  loadingTitle: { color: '#fff', fontSize: 28, fontWeight: '900', lineHeight: 34, textAlign: 'center', maxWidth: 320 },
  loadingStage: { width: 260, height: 350, justifyContent: 'flex-end', alignItems: 'center' },
  fallingMoney: { position: 'absolute', width: 64, height: 34, borderRadius: 8, backgroundColor: '#d7ffd7', borderWidth: 2, borderColor: '#61b26b', justifyContent: 'center', alignItems: 'center' },
  fallingMoneyLeft: { left: 60, top: 20 },
  fallingMoneyRight: { right: 60, top: 0 },
  fallingMoneyText: { color: '#2c7a3b', fontSize: 16, fontWeight: '900' },
  loadingJarLid: { width: 150, height: 28, borderRadius: 18, backgroundColor: '#ff5d8f', marginBottom: -4 },
  loadingJar: { width: 180, height: 230, borderRadius: 54, borderWidth: 6, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: 'rgba(189,234,255,0.16)', justifyContent: 'flex-end', overflow: 'hidden' },
  loadingJarFill: { marginHorizontal: 10, marginBottom: 10, height: 108, borderRadius: 34, backgroundColor: '#7fe7a3' },
});


