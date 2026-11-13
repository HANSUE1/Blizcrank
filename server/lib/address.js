"use strict";
const { str } = require("./http");

// Validates an address from the API (camelCase) into DB columns (snake_case).
function parseAddress(a = {}) {
  return {
    label: str(a.label, "address.label", { max: 40 }) || "Home",
    recipient_name: str(a.recipientName, "address.recipientName", { required: true, max: 120 }),
    phone: str(a.phone, "address.phone", { required: true, max: 30 }),
    line1: str(a.line1, "address.line1", { required: true, max: 200 }),
    line2: str(a.line2, "address.line2", { max: 200 }),
    barangay: str(a.barangay, "address.barangay", { max: 120 }),
    city: str(a.city, "address.city", { required: true, max: 120 }),
    province: str(a.province, "address.province", { required: true, max: 120 }),
    region: str(a.region, "address.region", { required: true, max: 60 }),
    postal_code: str(a.postalCode, "address.postalCode", { required: true, max: 12 }),
    country: "PH",
  };
}

function addressOut(a) {
  return {
    id: a.id, label: a.label, recipientName: a.recipient_name, phone: a.phone, line1: a.line1, line2: a.line2,
    barangay: a.barangay, city: a.city, province: a.province, region: a.region, postalCode: a.postal_code,
    country: a.country, isDefault: !!a.is_default,
  };
}

module.exports = { parseAddress, addressOut };
