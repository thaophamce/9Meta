const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyConversation, aggregateConversationCounts } = require('../modules/conv-classify');

test('classifyConversation nhan group khi co tin hieu duong tinh, con lai personal', () => {
  assert.equal(classifyConversation({ dataId: 'group_123' }), 'group');
  assert.equal(classifyConversation({ dataId: 'grp-9-abc' }), 'group');
  assert.equal(classifyConversation({ className: 'conv-item group' }), 'group');
  assert.equal(classifyConversation({ avatarCount: 2 }), 'group');
  assert.equal(classifyConversation({ avatarCount: 3 }), 'group');
  assert.equal(classifyConversation({ hasGroupIcon: true }), 'group');
  assert.equal(classifyConversation({ ariaLabel: 'Nhóm bạn bè' }), 'group');
  assert.equal(classifyConversation({ title: 'Group Family' }), 'group');
  assert.equal(classifyConversation({ title: 'Nhóm công việc' }), 'group');

  assert.equal(classifyConversation({ dataId: 'user_123', avatarCount: 1 }), 'personal');
  assert.equal(classifyConversation({ className: 'conv-item', title: 'Nguyễn Văn A' }), 'personal');
  assert.equal(classifyConversation({ avatarCount: 1 }), 'personal');
  assert.equal(classifyConversation({}), 'personal');
  // user_... chua group nhung khong co tin hieu nhom -> van personal (mac dinh an toan)
  assert.equal(classifyConversation({ dataId: 'user_999', ariaLabel: 'Nguyen Van A' }), 'personal');
});

test('aggregateConversationCounts chi dem hoi thoai unread theo loai', () => {
  const rows = [
    { unread: true, type: 'personal' },
    { unread: true, type: 'group' },
    { unread: false, type: 'personal' },
    { unread: true, type: 'personal' },
    { unread: false, type: 'group' },
    { unread: true, type: 'group' },
  ];
  assert.deepEqual(aggregateConversationCounts(rows), { total: 4, personalUnread: 2, groupUnread: 2 });
  assert.deepEqual(aggregateConversationCounts([]), { total: 0, personalUnread: 0, groupUnread: 0 });
  assert.deepEqual(aggregateConversationCounts([{ unread: false, type: 'group' }]), { total: 0, personalUnread: 0, groupUnread: 0 });
});
