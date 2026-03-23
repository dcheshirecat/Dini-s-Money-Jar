import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Category = {
  key: string;
  label: string;
  color: string;
};

type Expense = {
  id: string;
  amount: number;
  category: string;
  note: string;
  createdAt: string;
};

type StoredBudget = {
  monthKey: string;
  budget: number;
  expenses: Expense[];
};

type ScreenMode = 'jar' | 'tracker';

const STORAGE_KEY = 'dinis-money-jar-monthly-budget';

const CATEGORIES: Category[] = [
  { key: 'food', label: 'Food', color: '#FF8A80' },
  { key: 'fun', label: 'Fun', color: '#FFD166' },
  { key: 'shopping', label: 'Shopping', color: '#7C7CFF' },
  { key: 'transport', label: 'Transport', color: '#4ECDC4' },
  { key: 'gifts', label: 'Gifts', color: '#FF9F6E' },
  { key: 'savings', label: 'Savings', color: '#2EC4B6' },
  { key: 'other', label: 'Other', color: '#A78BFA' },
];

const QUICK_BUDGETS = [250, 500, 750, 1000];

const JAR_BILLS = [
  { left: 24, bottom: 36, rotate: '-10deg', scale: 0.92 },
  { left: 66, bottom: 52, rotate: '8deg', scale: 1.06 },
  { left: 114, bottom: 40, rotate: '-4deg', scale: 0.98 },
  { left: 154, bottom: 66, rotate: '14deg', scale: 0.9 },
  { left: 48, bottom: 106, rotate: '7deg', scale: 0.84 },
  { left: 110, bottom: 122, rotate: '-12deg', scale: 0.88 },
  { left: 152, bottom: 146, rotate: '6deg', scale: 0.8 },
];

const JAR_COINS = [
  { left: 34, bottom: 18, size: 16 },
  { left: 78, bottom: 14, size: 20 },
  { left: 128, bottom: 24, size: 14 },
  { left: 176, bottom: 18, size: 18 },
  { left: 60, bottom: 72, size: 12 },
  { left: 156, bottom: 90, size: 15 },
];

function getMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

function getMonthLabel(date = new Date()) {
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function App() {
  const [budget, setBudget] = useState(0);
  const [budgetInput, setBudgetInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].key);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [screenMode, setScreenMode] = useState<ScreenMode>('jar');

  const monthKey = getMonthKey();
  const monthLabel = getMonthLabel();

  useEffect(() => {
    async function loadBudget() {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!saved) {
          setIsLoaded(true);
          return;
        }

        const parsed: StoredBudget = JSON.parse(saved);

        if (parsed.monthKey === monthKey) {
          setBudget(parsed.budget);
          setBudgetInput(parsed.budget ? `${parsed.budget}` : '');
          setExpenses(parsed.expenses ?? []);
        } else {
          setBudgetInput(parsed.budget ? `${parsed.budget}` : '');
        }
      } catch {
        Alert.alert('Storage issue', 'We could not load your saved money jar yet.');
      } finally {
        setIsLoaded(true);
      }
    }

    loadBudget();
  }, [monthKey]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const payload: StoredBudget = {
      monthKey,
      budget,
      expenses,
    };

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {
      Alert.alert('Storage issue', 'We could not save your latest changes.');
    });
  }, [budget, expenses, isLoaded, monthKey]);

  const spent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const remaining = budget - spent;
  const remainingRatio = budget > 0 ? Math.max(0, Math.min(remaining / budget, 1)) : 0;
  const overBudgetRatio = budget > 0 ? Math.max(0, spent / budget - 1) : 0;

  const totalsByCategory = useMemo(
    () =>
      CATEGORIES.map((category) => {
        const total = expenses
          .filter((expense) => expense.category === category.key)
          .reduce((sum, expense) => sum + expense.amount, 0);

        return {
          ...category,
          total,
          percent: spent > 0 ? total / spent : 0,
        };
      }).sort((left, right) => right.total - left.total),
    [expenses, spent]
  );

  const topCategory = totalsByCategory.find((category) => category.total > 0);

  function saveBudget() {
    const nextBudget = Number.parseFloat(budgetInput);

    if (Number.isNaN(nextBudget) || nextBudget <= 0) {
      Alert.alert('Enter a budget', 'Choose how much spending money you have for this month.');
      return;
    }

    setBudget(nextBudget);
  }

  function addExpense() {
    const amount = Number.parseFloat(expenseAmount);

    if (Number.isNaN(amount) || amount <= 0) {
      Alert.alert('Enter an amount', 'Add how much you spent before saving the expense.');
      return;
    }

    const newExpense: Expense = {
      id: `${Date.now()}`,
      amount,
      category: selectedCategory,
      note: expenseNote.trim(),
      createdAt: new Date().toISOString(),
    };

    setExpenses((current) => [newExpense, ...current]);
    setExpenseAmount('');
    setExpenseNote('');
    setScreenMode('jar');
  }

  function deleteExpense(id: string) {
    setExpenses((current) => current.filter((expense) => expense.id !== id));
  }

  function resetMonth() {
    Alert.alert('Reset this month?', 'This clears the current budget and all expenses for the month.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          setBudget(0);
          setBudgetInput('');
          setExpenses([]);
          setExpenseAmount('');
          setExpenseNote('');
          setSelectedCategory(CATEGORIES[0].key);
          setScreenMode('jar');
        },
      },
    ]);
  }

  const jarFillHeight = 24 + remainingRatio * 260;
  const jarOverflowHeight = Math.min(overBudgetRatio * 44, 44);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Dini&apos;s Money Jar</Text>
          <Text style={styles.heroTitle}>A colorful budget app with a money jar you can actually watch empty.</Text>
          <Text style={styles.heroText}>
            Set a budget for {monthLabel}, track each purchase, and flip between your tracker and your jar view any
            time.
          </Text>
        </View>

        <View style={styles.tabCard}>
          <Pressable
            onPress={() => setScreenMode('jar')}
            style={[styles.tabButton, screenMode === 'jar' && styles.tabButtonActive]}>
            <Text style={[styles.tabButtonText, screenMode === 'jar' && styles.tabButtonTextActive]}>Jar</Text>
          </Pressable>
          <Pressable
            onPress={() => setScreenMode('tracker')}
            style={[styles.tabButton, screenMode === 'tracker' && styles.tabButtonActive]}>
            <Text style={[styles.tabButtonText, screenMode === 'tracker' && styles.tabButtonTextActive]}>Tracker</Text>
          </Pressable>
        </View>

        {screenMode === 'jar' ? (
          <>
            <View style={styles.jarSceneCard}>
              <Text style={styles.sectionTitle}>Money jar</Text>
              <Text style={styles.sectionSubtitle}>
                The jar starts full and slowly lowers as you spend. Right now it is holding {formatCurrency(Math.max(remaining, 0))}.
              </Text>

              <View style={styles.jarStage}>
                <View style={styles.jarShadow} />
                <View style={styles.jarLid} />
                <View style={styles.jarLip} />
                <View style={styles.jarBody}>
                  <View style={styles.jarHighlightLeft} />
                  <View style={styles.jarHighlightRight} />
                  <View style={[styles.jarMoneyFill, { height: jarFillHeight }]}>
                    <View style={styles.jarMoneyTop} />
                    {JAR_BILLS.slice(0, Math.max(1, Math.ceil(remainingRatio * JAR_BILLS.length))).map((bill, index) => (
                      <View
                        key={`${bill.left}-${bill.bottom}-${index}`}
                        style={[
                          styles.bill,
                          {
                            left: bill.left,
                            bottom: bill.bottom,
                            transform: [{ rotate: bill.rotate }, { scale: bill.scale }],
                          },
                        ]}>
                        <View style={styles.billStripe} />
                        <Text style={styles.billText}>$</Text>
                      </View>
                    ))}
                    {JAR_COINS.slice(0, Math.max(1, Math.ceil(remainingRatio * JAR_COINS.length))).map((coin, index) => (
                      <View
                        key={`${coin.left}-${coin.bottom}-${index}`}
                        style={[
                          styles.coin,
                          {
                            left: coin.left,
                            bottom: coin.bottom,
                            width: coin.size,
                            height: coin.size,
                            borderRadius: coin.size / 2,
                          },
                        ]}
                      />
                    ))}
                  </View>
                  {remaining < 0 ? <View style={[styles.jarOverflow, { height: jarOverflowHeight }]} /> : null}
                </View>
              </View>

              <View style={styles.jarStatsRow}>
                <View style={[styles.jarStatCard, styles.jarStatMint]}>
                  <Text style={styles.jarStatLabel}>Left</Text>
                  <Text style={styles.jarStatValue}>{formatCurrency(remaining)}</Text>
                </View>
                <View style={[styles.jarStatCard, styles.jarStatLavender]}>
                  <Text style={styles.jarStatLabel}>Spent</Text>
                  <Text style={styles.jarStatValue}>{formatCurrency(spent)}</Text>
                </View>
              </View>

              <View style={styles.jarCaptionCard}>
                <Text style={styles.jarCaptionTitle}>
                  {budget <= 0
                    ? 'Pick a monthly budget to fill the jar.'
                    : remaining >= budget * 0.6
                      ? 'Your jar still looks wonderfully full.'
                      : remaining > 0
                        ? 'The jar is dropping, but you still have room.'
                        : 'The jar is empty. Time for a reset or a higher budget.'}
                </Text>
                <Text style={styles.jarCaptionText}>
                  {topCategory
                    ? `${topCategory.label} is using the biggest share of your spending so far.`
                    : 'Add your first expense and the jar will begin reacting right away.'}
                </Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Quick spend</Text>
                  <Text style={styles.sectionSubtitle}>Drop in a new expense and jump back to the jar instantly.</Text>
                </View>
                <Pressable onPress={() => setScreenMode('tracker')} style={styles.resetButton}>
                  <Text style={styles.resetButtonText}>Open tracker</Text>
                </Pressable>
              </View>

              <View style={styles.categoryWrap}>
                {CATEGORIES.map((category) => {
                  const isSelected = category.key === selectedCategory;

                  return (
                    <Pressable
                      key={category.key}
                      onPress={() => setSelectedCategory(category.key)}
                      style={[styles.categoryChip, { backgroundColor: isSelected ? category.color : '#F4EEFF' }]}>
                      <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
                        {category.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                keyboardType="decimal-pad"
                placeholder="How much did you spend?"
                placeholderTextColor="#7D6B91"
                style={styles.input}
                value={expenseAmount}
                onChangeText={setExpenseAmount}
              />

              <TextInput
                placeholder="Quick note"
                placeholderTextColor="#7D6B91"
                style={styles.input}
                value={expenseNote}
                onChangeText={setExpenseNote}
              />

              <Pressable onPress={addExpense} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Add expense to jar</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Monthly budget</Text>
                  <Text style={styles.sectionSubtitle}>Pick the amount that fits what you made this month.</Text>
                </View>
                <Pressable onPress={resetMonth} style={styles.resetButton}>
                  <Text style={styles.resetButtonText}>Reset month</Text>
                </Pressable>
              </View>

              <TextInput
                keyboardType="decimal-pad"
                placeholder="Example: 650"
                placeholderTextColor="#7D6B91"
                style={styles.input}
                value={budgetInput}
                onChangeText={setBudgetInput}
              />

              <View style={styles.quickBudgetRow}>
                {QUICK_BUDGETS.map((amount) => (
                  <Pressable key={amount} onPress={() => setBudgetInput(`${amount}`)} style={styles.quickBudgetChip}>
                    <Text style={styles.quickBudgetText}>{formatCurrency(amount)}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable onPress={saveBudget} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Save monthly budget</Text>
              </Pressable>
            </View>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, styles.summaryPink]}>
                <Text style={styles.summaryLabel}>Budget</Text>
                <Text style={styles.summaryValue}>{formatCurrency(budget)}</Text>
              </View>
              <View style={[styles.summaryCard, styles.summaryYellow]}>
                <Text style={styles.summaryLabel}>Spent</Text>
                <Text style={styles.summaryValue}>{formatCurrency(spent)}</Text>
              </View>
            </View>

            <View style={[styles.balanceCard, remaining >= 0 ? styles.balanceGood : styles.balanceAlert]}>
              <Text style={styles.balanceLabel}>Money left for {monthLabel}</Text>
              <Text style={styles.balanceValue}>{formatCurrency(remaining)}</Text>
              <Text style={styles.balanceNote}>
                {remaining >= 0
                  ? 'You are still inside your budget.'
                  : 'You have gone over this month. A quick budget tweak can get you back on track.'}
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Add an expense</Text>
              <Text style={styles.sectionSubtitle}>Choose the category, then drop in the amount and a note if you want.</Text>

              <View style={styles.categoryWrap}>
                {CATEGORIES.map((category) => {
                  const isSelected = category.key === selectedCategory;

                  return (
                    <Pressable
                      key={category.key}
                      onPress={() => setSelectedCategory(category.key)}
                      style={[styles.categoryChip, { backgroundColor: isSelected ? category.color : '#F4EEFF' }]}>
                      <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
                        {category.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                keyboardType="decimal-pad"
                placeholder="How much did you spend?"
                placeholderTextColor="#7D6B91"
                style={styles.input}
                value={expenseAmount}
                onChangeText={setExpenseAmount}
              />

              <TextInput
                placeholder="Quick note (coffee, movie, bus ride...)"
                placeholderTextColor="#7D6B91"
                style={styles.input}
                value={expenseNote}
                onChangeText={setExpenseNote}
              />

              <Pressable onPress={addExpense} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Add expense</Text>
              </Pressable>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Category breakdown</Text>
              <Text style={styles.sectionSubtitle}>
                {topCategory
                  ? `${topCategory.label} is your biggest spending category right now.`
                  : 'Once you add expenses, your category totals will show up here.'}
              </Text>

              <View style={styles.breakdownList}>
                {totalsByCategory.map((category) => (
                  <View key={category.key} style={styles.breakdownItem}>
                    <View style={styles.breakdownHeader}>
                      <Text style={styles.breakdownLabel}>{category.label}</Text>
                      <Text style={styles.breakdownAmount}>{formatCurrency(category.total)}</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            backgroundColor: category.color,
                            width: `${Math.max(category.percent * 100, category.total > 0 ? 8 : 0)}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Recent spending</Text>
              <Text style={styles.sectionSubtitle}>Your newest expenses stay at the top so the list is easy to scan.</Text>

              {expenses.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>Your jar is waiting</Text>
                  <Text style={styles.emptyText}>Add your first expense and the tracker will start filling in automatically.</Text>
                </View>
              ) : (
                expenses.map((expense) => {
                  const category = CATEGORIES.find((item) => item.key === expense.category) ?? CATEGORIES[0];

                  return (
                    <View key={expense.id} style={styles.expenseRow}>
                      <View style={[styles.expenseColor, { backgroundColor: category.color }]} />
                      <View style={styles.expenseContent}>
                        <Text style={styles.expenseTitle}>{category.label}</Text>
                        <Text style={styles.expenseMeta}>
                          {expense.note || 'No note'} {'\u2022'} {new Date(expense.createdAt).toLocaleDateString('en-US')}
                        </Text>
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
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#24134D',
  },
  content: {
    padding: 20,
    paddingBottom: 36,
    gap: 18,
    backgroundColor: '#24134D',
  },
  heroCard: {
    backgroundColor: '#FF5D8F',
    borderRadius: 28,
    padding: 24,
    shadowColor: '#14072D',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  eyebrow: {
    color: '#FFF2A8',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '900',
    marginBottom: 10,
  },
  heroText: {
    color: '#FFF5FA',
    fontSize: 16,
    lineHeight: 23,
  },
  tabCard: {
    flexDirection: 'row',
    backgroundColor: '#3A236F',
    borderRadius: 999,
    padding: 6,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#FFE38A',
  },
  tabButtonText: {
    color: '#E3D9FF',
    fontSize: 15,
    fontWeight: '800',
  },
  tabButtonTextActive: {
    color: '#523300',
  },
  jarSceneCard: {
    backgroundColor: '#FFF8FE',
    borderRadius: 28,
    padding: 18,
    gap: 16,
  },
  sectionCard: {
    backgroundColor: '#FFF8FE',
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: '#241042',
    fontSize: 22,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: '#6D5C85',
    fontSize: 14,
    lineHeight: 20,
  },
  jarStage: {
    height: 400,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 16,
  },
  jarShadow: {
    position: 'absolute',
    bottom: 12,
    width: 220,
    height: 28,
    borderRadius: 999,
    backgroundColor: 'rgba(44, 24, 88, 0.2)',
  },
  jarLid: {
    position: 'absolute',
    top: 10,
    width: 190,
    height: 34,
    borderRadius: 20,
    backgroundColor: '#F05B6B',
    shadowColor: '#AB3652',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  jarLip: {
    position: 'absolute',
    top: 38,
    width: 166,
    height: 26,
    borderRadius: 18,
    backgroundColor: '#FF95A5',
  },
  jarBody: {
    width: 260,
    height: 320,
    borderBottomLeftRadius: 110,
    borderBottomRightRadius: 110,
    borderTopLeftRadius: 56,
    borderTopRightRadius: 56,
    borderWidth: 6,
    borderColor: 'rgba(255,255,255,0.58)',
    backgroundColor: 'rgba(189, 234, 255, 0.2)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  jarHighlightLeft: {
    position: 'absolute',
    left: 24,
    top: 34,
    width: 24,
    height: 190,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  jarHighlightRight: {
    position: 'absolute',
    right: 28,
    top: 52,
    width: 14,
    height: 160,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  jarMoneyFill: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    borderBottomLeftRadius: 90,
    borderBottomRightRadius: 90,
    borderTopLeftRadius: 38,
    borderTopRightRadius: 38,
    backgroundColor: '#7FE7A3',
    overflow: 'hidden',
  },
  jarMoneyTop: {
    position: 'absolute',
    top: -10,
    left: 0,
    right: 0,
    height: 26,
    borderRadius: 999,
    backgroundColor: '#AAFFC2',
  },
  bill: {
    position: 'absolute',
    width: 58,
    height: 28,
    borderRadius: 7,
    backgroundColor: '#D7FFD7',
    borderWidth: 2,
    borderColor: '#61B26B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  billStripe: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 8,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#61B26B',
    opacity: 0.4,
  },
  billText: {
    color: '#2C7A3B',
    fontWeight: '900',
    fontSize: 14,
  },
  coin: {
    position: 'absolute',
    backgroundColor: '#FFD166',
    borderWidth: 2,
    borderColor: '#D79D1E',
  },
  jarOverflow: {
    position: 'absolute',
    left: 52,
    right: 52,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#FF8A80',
    opacity: 0.65,
  },
  jarStatsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  jarStatCard: {
    flex: 1,
    borderRadius: 22,
    padding: 18,
    minHeight: 112,
    justifyContent: 'space-between',
  },
  jarStatMint: {
    backgroundColor: '#B7F7CB',
  },
  jarStatLavender: {
    backgroundColor: '#D8CBFF',
  },
  jarStatLabel: {
    color: '#3B234F',
    fontSize: 15,
    fontWeight: '700',
  },
  jarStatValue: {
    color: '#241042',
    fontSize: 27,
    fontWeight: '900',
  },
  jarCaptionCard: {
    backgroundColor: '#F4EEFF',
    borderRadius: 22,
    padding: 18,
    gap: 6,
  },
  jarCaptionTitle: {
    color: '#241042',
    fontSize: 18,
    fontWeight: '800',
  },
  jarCaptionText: {
    color: '#6D5C85',
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#F2EBFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: '#241042',
  },
  quickBudgetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickBudgetChip: {
    backgroundColor: '#FFE38A',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quickBudgetText: {
    color: '#5D3A00',
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#7C7CFF',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  resetButton: {
    backgroundColor: '#F4EEFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resetButtonText: {
    color: '#5A3F8A',
    fontSize: 13,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 14,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 24,
    padding: 18,
    minHeight: 120,
    justifyContent: 'space-between',
  },
  summaryPink: {
    backgroundColor: '#FFB3C7',
  },
  summaryYellow: {
    backgroundColor: '#FFE38A',
  },
  summaryLabel: {
    color: '#3B234F',
    fontSize: 15,
    fontWeight: '700',
  },
  summaryValue: {
    color: '#241042',
    fontSize: 28,
    fontWeight: '900',
  },
  balanceCard: {
    borderRadius: 28,
    padding: 22,
    gap: 8,
  },
  balanceGood: {
    backgroundColor: '#2EC4B6',
  },
  balanceAlert: {
    backgroundColor: '#FF8A80',
  },
  balanceLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  balanceValue: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
  },
  balanceNote: {
    color: '#F8FFFE',
    fontSize: 14,
    lineHeight: 20,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  categoryChipText: {
    color: '#402A66',
    fontWeight: '700',
  },
  categoryChipTextSelected: {
    color: '#FFFFFF',
  },
  breakdownList: {
    gap: 12,
  },
  breakdownItem: {
    gap: 8,
  },
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    color: '#241042',
    fontSize: 15,
    fontWeight: '700',
  },
  breakdownAmount: {
    color: '#241042',
    fontSize: 15,
    fontWeight: '700',
  },
  progressTrack: {
    height: 14,
    borderRadius: 999,
    backgroundColor: '#EFE6FF',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  emptyState: {
    backgroundColor: '#F4EEFF',
    borderRadius: 20,
    padding: 18,
    gap: 6,
  },
  emptyTitle: {
    color: '#241042',
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    color: '#6D5C85',
    fontSize: 14,
    lineHeight: 20,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8F2FF',
    borderRadius: 20,
    padding: 14,
  },
  expenseColor: {
    width: 14,
    height: 50,
    borderRadius: 999,
  },
  expenseContent: {
    flex: 1,
    gap: 4,
  },
  expenseTitle: {
    color: '#241042',
    fontSize: 17,
    fontWeight: '800',
  },
  expenseMeta: {
    color: '#6D5C85',
    fontSize: 13,
  },
  expenseSide: {
    alignItems: 'flex-end',
    gap: 6,
  },
  expenseAmount: {
    color: '#241042',
    fontSize: 16,
    fontWeight: '800',
  },
  deleteText: {
    color: '#D14A76',
    fontSize: 13,
    fontWeight: '700',
  },
});
