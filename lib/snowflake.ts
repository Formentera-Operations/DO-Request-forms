import snowflake from 'snowflake-sdk';

// Configure Snowflake to use fewer resources
snowflake.configure({ logLevel: 'ERROR' });

export interface SnowflakeOwner {
  OWNER_NUMBER: string;
  OWNER_NAME: string;
}

export interface SnowflakeCheck {
  CHECK_NUMBER: string;
  CHECK_DESCRIPTION: string;
}

/**
 * Execute a query against Snowflake and return results.
 * Connections are created per-request and destroyed after use.
 */
export async function querySnowflake<T = any>(
  sqlText: string,
  binds: any[] = []
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const connection = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT!,
      username: process.env.SNOWFLAKE_USERNAME!,
      password: process.env.SNOWFLAKE_PASSWORD!,
      database: process.env.SNOWFLAKE_DATABASE!,
      schema: process.env.SNOWFLAKE_SCHEMA!,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE!,
      role: process.env.SNOWFLAKE_ROLE!,
    });

    connection.connect((err) => {
      if (err) {
        console.error('Snowflake connection error:', err);
        return reject(err);
      }

      connection.execute({
        sqlText,
        binds,
        complete: (err, stmt, rows) => {
          connection.destroy((destroyErr) => {
            if (destroyErr) console.error('Error destroying connection:', destroyErr);
          });

          if (err) {
            console.error('Snowflake query error:', err);
            return reject(err);
          }

          resolve((rows || []) as T[]);
        },
      });
    });
  });
}

/**
 * Fetch owner numbers from Snowflake.
 *
 * TODO: Update the SQL query below to match your actual
 * Snowflake table/view name and column names.
 */
export async function getOwners(search?: string): Promise<SnowflakeOwner[]> {
  let sql = `SELECT OWNER_NUMBER, OWNER_NAME FROM OWNERS`;
  const binds: any[] = [];

  if (search && search.trim()) {
    sql += ` WHERE OWNER_NUMBER ILIKE ? OR OWNER_NAME ILIKE ?`;
    binds.push(`%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY OWNER_NUMBER LIMIT 50`;
  return querySnowflake<SnowflakeOwner>(sql, binds);
}

/**
 * Fetch check numbers from Snowflake.
 *
 * TODO: Update the SQL query below to match your actual
 * Snowflake table/view name and column names.
 */
export async function getChecks(search?: string): Promise<SnowflakeCheck[]> {
  let sql = `SELECT CHECK_NUMBER, CHECK_DESCRIPTION FROM CHECKS`;
  const binds: any[] = [];

  if (search && search.trim()) {
    sql += ` WHERE CHECK_NUMBER ILIKE ? OR CHECK_DESCRIPTION ILIKE ?`;
    binds.push(`%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY CHECK_NUMBER LIMIT 50`;
  return querySnowflake<SnowflakeCheck>(sql, binds);
}
