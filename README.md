# Getting the tables and data

Vercel hosts the web application; it does not host this MySQL data. You provide your Aiven MySQL service and add its connection values to Vercel.

For the original demo, use the free educational `classicmodels` sample database. It contains the tables used by this project: `productlines`, `products`, `offices`, `employees`, `customers`, `payments`, `orders`, and `orderdetails`.

1. Download the Classic Models SQL ZIP from the [MySQL Sample Database page](https://www.mysqltutorial.org/getting-started-with-mysql/mysql-sample-database/).
2. Create a database in your Aiven MySQL service, or use its default database.
3. Import the downloaded `.sql` file:

```bash
mysql -h HOST -P 3306 -u USER -p classicmodels < mysqlsampledatabase.sql
```

4. In Aiven Console, open your MySQL service's Overview → Connection information. Copy the host, port, database, username, and password into `AIVEN_MYSQL_HOST`, `AIVEN_MYSQL_PORT`, `AIVEN_MYSQL_DATABASE`, `AIVEN_MYSQL_USER`, and `AIVEN_MYSQL_PASSWORD`.
5. Download Aiven's `ca.pem` certificate. Encode it for local PowerShell with:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("ca.pem"))
```

Put the output in `AIVEN_MYSQL_CA_CERT_BASE64` and keep `AIVEN_MYSQL_SSL=true`.

The app does not need this repository's CSV file. On every query it reads `INFORMATION_SCHEMA.COLUMNS`, discovers the live tables and columns, and gives that schema to Groq. You can therefore replace Classic Models with your own Aiven database without editing application code.
