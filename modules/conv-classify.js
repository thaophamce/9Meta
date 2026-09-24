// Phан loại hoi thoai Zalo ca nhan vs nhom + dem unread theo loai.
// Ham thuan (khong require electron, khong cham DOM) de preload inline ban tuong
// duong vao injection script, va de node -- test kiem chung doc lap.
//
// Chи nhan 'group' khi CO tin hieu nhom DUONG TINH; moi truong hop mo ho tra
// 'personal' (mac dinh an toan - khong lam mat hoi thoai ca nhan khoi bo loc).

// Du lieu dau vao: cac gia tri DA TRICH san tu 1 dong danh sach.
function classifyConversation(input = {}) {
  const dataId = String(input.dataId || '');
  const className = String(input.className || '');
  const ariaLabel = String(input.ariaLabel || '');
  const title = String(input.title || '');
  const avatarCount = Number(input.avatarCount) || 0;
  const hasGroupIcon = !!input.hasGroupIcon;

  // data-id nhom cua Zalo thuong dang `group_<id>` / `grp_<id>` / `...group...`.
  if (/(^|[^a-z])(group|grp)[_-]/i.test(dataId)) return 'group';
  if (/\bgroup\b/i.test(className)) return 'group';
  if (/(nh[oó]m|group)/i.test(ariaLabel) || /(nh[oó]m|group)/i.test(title)) return 'group';
  if (avatarCount >= 2) return 'group';
  if (hasGroupIcon) return 'group';
  return 'personal';
}

// rows: [{ unread:boolean, type:'personal'|'group' }] -> dem SO HOI THOAI unread theo loai.
// total = so hoi thoai unread tong cong (giung dinh nghia cu cua badge hien tai).
function aggregateConversationCounts(rows = []) {
  let personalUnread = 0;
  let groupUnread = 0;
  for (const row of rows) {
    if (!row || !row.unread) continue;
    if (row.type === 'group') groupUnread += 1;
    else personalUnread += 1;
  }
  return { total: personalUnread + groupUnread, personalUnread, groupUnread };
}

module.exports = { classifyConversation, aggregateConversationCounts };
