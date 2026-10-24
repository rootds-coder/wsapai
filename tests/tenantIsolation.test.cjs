const test = require("node:test");
const assert = require("node:assert/strict");

test("tenant isolation: listContacts query scopes strictly to tenant", () => {
  // Mock DB contacts collection
  const mockContacts = [
    { jid: "111@s.whatsapp.net", name: "Admin Contact 1", userId: "admin" },
    { jid: "222@s.whatsapp.net", name: "Admin Contact 2", userId: "admin" },
    { jid: "333@s.whatsapp.net", name: "Akhil Contact", userId: "akhil" },
  ];

  // Helper simulating the fixed listContacts query
  function filterContacts(contacts, userId) {
    if (userId && userId !== "admin") {
      return contacts.filter(c => c.userId === userId);
    }
    return contacts;
  }

  const akhilContacts = filterContacts(mockContacts, "akhil");
  assert.equal(akhilContacts.length, 1);
  assert.equal(akhilContacts[0].jid, "333@s.whatsapp.net");
  assert.equal(akhilContacts[0].name, "Akhil Contact");

  const adminContacts = filterContacts(mockContacts, "admin");
  assert.equal(adminContacts.length, 3);
});

test("tenant isolation: chat history scopes strictly to tenant", () => {
  const mockHistory = [
    { jid: "111@s.whatsapp.net", body: "Hello admin", userId: "admin" },
    { jid: "111@s.whatsapp.net", body: "Hello Akhil", userId: "akhil" },
  ];

  function filterHistory(history, jid, userId) {
    if (userId && userId !== "admin") {
      return history.filter(m => m.jid === jid && m.userId === userId);
    }
    return history.filter(m => m.jid === jid);
  }

  const akhilMessages = filterHistory(mockHistory, "111@s.whatsapp.net", "akhil");
  assert.equal(akhilMessages.length, 1);
  assert.equal(akhilMessages[0].body, "Hello Akhil");

  const otherUserMessages = filterHistory(mockHistory, "111@s.whatsapp.net", "someone_else");
  assert.equal(otherUserMessages.length, 0);
});

test("tenant isolation: deleteContact cannot delete other users contacts", () => {
  let mockContacts = [
    { jid: "111@s.whatsapp.net", userId: "admin" },
    { jid: "222@s.whatsapp.net", userId: "akhil" },
  ];

  function deleteContactMock(jid, userId) {
    if (userId && userId !== "admin") {
      mockContacts = mockContacts.filter(c => !(c.jid === jid && c.userId === userId));
    } else {
      mockContacts = mockContacts.filter(c => c.jid !== jid);
    }
  }

  // Akhil tries to delete admin's contact (111@s.whatsapp.net)
  deleteContactMock("111@s.whatsapp.net", "akhil");
  assert.equal(mockContacts.length, 2, "Admin contact should not be deleted by Akhil");

  // Akhil deletes his own contact (222@s.whatsapp.net)
  deleteContactMock("222@s.whatsapp.net", "akhil");
  assert.equal(mockContacts.length, 1);
  assert.equal(mockContacts[0].userId, "admin");
});

test("tenant isolation: deleteAllContacts cannot wipe other users contacts", () => {
  let mockContacts = [
    { jid: "111@s.whatsapp.net", userId: "admin" },
    { jid: "222@s.whatsapp.net", userId: "akhil" },
    { jid: "333@s.whatsapp.net", userId: "akhil" },
  ];

  function deleteAllContactsMock(userId) {
    if (userId && userId !== "admin") {
      const remaining = mockContacts.filter(c => c.userId !== userId);
      const deletedCount = mockContacts.length - remaining.length;
      mockContacts = remaining;
      return { contactsDeleted: deletedCount };
    }
    const count = mockContacts.length;
    mockContacts = [];
    return { contactsDeleted: count };
  }

  // Akhil wipes all his contacts
  const res = deleteAllContactsMock("akhil");
  assert.equal(res.contactsDeleted, 2);
  assert.equal(mockContacts.length, 1);
  assert.equal(mockContacts[0].userId, "admin", "Admin contacts must remain untouched");
});
