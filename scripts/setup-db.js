import "dotenv/config";
import mysql from "mysql2/promise";

const dbName = process.env.DB_NAME || "ioorganize";

const baseConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  multipleStatements: true,
};

const schema = `
CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`${dbName}\`;

CREATE TABLE IF NOT EXISTS events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  event_date_text VARCHAR(32) NOT NULL DEFAULT '',
  city VARCHAR(255) NOT NULL DEFAULT '',
  venue VARCHAR(255) NOT NULL DEFAULT '',
  note VARCHAR(255) NOT NULL DEFAULT '',
  price_eur DECIMAL(12,2) NOT NULL DEFAULT 0,
  transport_rsd DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  payment_date_text VARCHAR(32) NOT NULL DEFAULT '',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency ENUM('EUR', 'RSD') NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL
);
`;

const connection = await mysql.createConnection(baseConfig);

try {
  await connection.query(schema);
  await connection.query(`USE \`${dbName}\``);
  await connection.query(
    `INSERT INTO settings (setting_key, setting_value)
     VALUES
       ('exchangeRate', '116.5'),
       ('asOfDate', ?)
     ON DUPLICATE KEY UPDATE setting_value = setting_value`,
    [todayText()],
  );
  console.log(`Database "${dbName}" is ready.`);
} finally {
  await connection.end();
}

function todayText() {
  const now = new Date();
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}.`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
