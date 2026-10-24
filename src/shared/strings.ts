import type { CsvIssue } from '../core/csv';
import type { ErrorCode } from './messages';
import type { Mark } from './types';

/**
 * Every user-visible string lives here, so another locale can be added as a sibling module
 * without touching the UI code.
 */
export const strings = {
  // Blocked page
  gateTitle: '先停一下，再决定要不要打开',
  targetLabel: '即将访问',
  abandon: '本次不浏览',
  proceed: '等待后浏览',
  durationsTitle: '选择临时放行时长',
  durationsHelp: '放行期间同一网站不再拦截；到期后再次访问会重新拦截。',
  goTarget: '前往网站',
  wordsTitle: '顺便复习几个单词',
  wordsHelp: '单词学习不影响等待和放行，可以跳过。',
  closeWords: '关闭单词学习',
  noWords: '词表为空。可以在设置页导入 CSV 词表。',
  unavailable: '这个拦截页面已失效（例如浏览器已经重启）。可以关闭它，再重新访问目标网站。',
  alreadyResolved: '这次拦截已经处理过了。',
  progressLabel: '等待进度',
  waitDone: '现在可以选择是否放行了。',
  countdownDone: '可以选择了',
  markKnow: '认识',
  markUnknown: '不认识',
  markReview: '需要复习',
  openSettings: '打开设置',
  countdown: (seconds: number): string => `还需等待 ${seconds} 秒`,
  proceedWaiting: (seconds: number): string => `等待后浏览（${seconds} 秒）`,
  grantOption: (minutes: number): string => `放行 ${minutes} 分钟`,
  markedAs: (label: string): string => `已记录：${label}`,
  trendTip: (day: string, shown: number, abandoned: number, granted: number): string =>
    `${day}：拦截 ${shown} 次 · 放弃 ${abandoned} · 放行 ${granted}`,
  markLabel: (mark: Mark): string =>
    mark === 'know' ? '认识' : mark === 'unknown' ? '不认识' : '需要复习',

  // Done page
  doneTitle: '已取消本次访问',
  doneBody: '你可以关闭这个标签页，或者在其他页面继续。',

  // Options page
  pageTitle: '等一下 · 设置',
  pauseLabel: '暂停所有拦截',
  pauseHelp: '开启后所有网站都不会被拦截，规则和统计保持不变。',
  storeError: '数据无法读取，可能来自更新的版本。请先导出备份，再清除本地数据。',
  rulesTitle: '网站规则',
  rulesHelp:
    '默认包含子域名。可以只拦截某个路径，例如 zhihu.com/hot。端口、查询参数和锚点会被忽略。',
  rulePlaceholder: '例如 example.com 或 example.com/path',
  ruleSubdomains: '包含子域名',
  ruleAdd: '添加规则',
  ruleEmpty: '还没有规则。',
  ruleEnabled: '启用',
  ruleDelete: '删除',
  ruleScopeSite: '整站',
  ruleScopePath: (path: string): string => `路径 ${path}`,
  ruleSubdomainsOn: '含子域名',
  ruleSubdomainsOff: '仅此域名',
  ruleAdded: '规则已添加。',
  ruleDeleted: '规则已删除。',
  waitTitle: '等待与放行',
  waitSecondsLabel: '等待秒数（0–120，0 表示不强制等待）',
  grantLabel: '放行时长选项（分钟，用逗号分隔，最多 6 个）',
  moveLabel: '显示移动按钮（降低惯性点击）',
  motionLabel: '动画设置',
  motionSystem: '跟随系统',
  motionReduced: '减少动态效果',
  motionFull: '保留动效',
  themeLabel: '外观',
  themeSystem: '跟随系统',
  themeLight: '浅色',
  themeDark: '深色',
  saveSettings: '保存设置',
  settingsSaved: '设置已保存。',
  wordsTitleSettings: '单词学习',
  wordsEnabledLabel: '在等待页显示单词学习',
  wordsSummary: (total: number, due: number, fresh: number): string =>
    `词表共 ${total} 个，待复习 ${due} 个，新词 ${fresh} 个。`,
  wordsImportLabel: '导入 CSV 词表（UTF-8，需包含 word 和 meaning 两列）',
  wordsImport: '导入词表',
  wordsRestore: '恢复示例词表',
  wordsClear: '清空词表',
  wordsImported: (added: number, existing: number, duplicates: number): string =>
    `已导入 ${added} 个新词，${existing} 个已存在（保留原有进度），文件内重复 ${duplicates} 个。`,
  wordsRestored: (added: number): string => `已恢复 ${added} 个示例词。`,
  statsTitle: '数据统计',
  statsEnabledLabel: '记录统计数据',
  statsMetric: '指标',
  statsToday: '今日',
  statsWeek: '近 7 天',
  statsMonth: '近 30 天',
  statsShown: '拦截次数',
  statsAbandoned: '放弃次数',
  statsGranted: '放行次数',
  statsRatio: '放弃比例',
  statsMinutes: '授权时长（分钟）',
  statsWords: '单词学习次数',
  statsDefinitions:
    '放弃比例 = 放弃次数 ÷（放弃次数 + 放行次数）。授权时长是放行设定的时长，不等于实际浏览时长；放弃浏览也不代表永久避免访问。',
  statsSitesTitle: '按网站（最近 30 天）',
  statsSite: '网站',
  statsTrendTitle: '最近 7 天拦截次数',
  statsExportCsv: '导出 CSV',
  statsExportJson: '导出 JSON',
  statsClear: '清除统计数据',
  statsNoData: '暂无数据。',
  dataTitle: '数据与隐私',
  dataHelp: '所有数据只保存在本机浏览器中，不会上传到任何服务器。',
  dataExport: '导出全部数据（JSON）',
  dataImport: '导入备份',
  dataImportLabel: '选择备份文件',
  dataClear: '清除全部本地数据',
  dataRestored: (rules: number, words: number): string =>
    `备份已导入：${rules} 条规则，${words} 个单词。`,
  confirmDeleteRule: '确定删除这条规则吗？',
  confirmClearStats: '确定清除全部统计数据吗？此操作无法撤销。',
  confirmClearWords: '确定清空词表和学习进度吗？此操作无法撤销。',
  confirmClearAll:
    '确定清除全部本地数据（规则、设置、统计、单词进度）吗？建议先导出备份。此操作无法撤销。',
  confirmRestore: '导入备份会替换当前的规则、设置、统计和单词进度。确定继续吗？',
  saved: '已保存。',
  invalidEncoding: '文件不是有效的 UTF-8 编码，请另存为 UTF-8 后再导入。',
  invalidFile: '文件无法读取。',
  cleared: '已清除。',
  memoTitle: '备忘录',
  memoHelp: '暂停的时候顺手看看今天要做的事。打勾表示完成，第二天还能在这里看到昨天的记录。',
  memoAdd: '添加',
  memoEmptyToday: '今天还没有备忘。',
  memoEmptyYesterday: '昨天没有备忘。',
  memoDone: '已完成',
  memoOpen: '未完成',
  memoDelete: '删除',
  memoYesterdayTitle: '昨天',
  memoCarry: '把未完成的转到今天',
  memoNothingToCarry: '昨天没有未完成的事项。',
  memoSummary: (done: number, total: number): string => `已完成 ${done} / ${total}`,
  memoCarried: (added: number): string => `已转入 ${added} 项。`,
  memoAdded: '已添加。',
  memoDeleted: '已删除。',
} as const;

export const errorMessages: Record<ErrorCode, string> = {
  internal: '出现了意外错误，请稍后重试。',
  invalid_request: '请求格式不正确。',
  unknown_block: '这个拦截页面已经失效。',
  wait_pending: '等待还没有结束，请稍候。',
  invalid_minutes: '这个放行时长不可用，请重新选择。',
  already_resolved: '这次拦截已经处理过了。',
  not_in_block: '这个单词不属于当前拦截页面。',
  unknown_word: '找不到这个单词。',
  empty: '请输入网站域名。',
  unsafe_protocol: '只支持 http 或 https 网址。',
  invalid_host: '域名格式不正确。',
  invalid_path: '路径过长。',
  duplicate: '已经存在相同的规则。',
  too_many_rules: '规则数量已达上限。',
  not_found: '找不到这条记录。',
  invalid_settings: '设置内容不正确，没有保存。',
  invalid_words: '词表没有导入，请检查文件内容。',
  invalid_backup: '备份文件格式不正确，没有导入。',
  incompatible_store: '备份来自更新的版本，无法导入。',
  storage_failed: '保存失败，可能是浏览器存储空间不足。请释放空间后重试。',
  memo_empty: '备忘内容不能为空。',
  memo_too_long: '备忘最多 200 个字。',
  memo_invalid_text: '备忘里包含不可见的控制字符。',
  too_many_memos: '这一天的备忘已经达到上限（50 项）。',
};

export function csvIssueMessage(issue: CsvIssue): string {
  const where = issue.record === undefined ? '' : `第 ${issue.record} 行：`;
  switch (issue.code) {
    case 'syntax':
      return '文件格式错误（引号没有正确闭合）。';
    case 'empty':
      return '文件是空的。';
    case 'missing_columns':
      return '文件第一行必须包含 word 和 meaning 两列。';
    case 'too_many_rows':
      return '词条数量超过上限（5000 个）。';
    case 'missing_field':
      return `${where}word 和 meaning 都不能为空。`;
    case 'too_long':
      return `${where}单词或释义太长。`;
    case 'control_character':
      return `${where}包含不可见的控制字符。`;
  }
}
