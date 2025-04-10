const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const pool = require("../db");

/**
 * User login
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        errMsg: "Username and password are required",
      });
    }

    // Find user by username
    const userQuery = `
      SELECT 
        u.id, 
        u.name, 
        u.company_id,
        u.user_type,
        u.password, 
        c.name as company_name 
      FROM 
        users u
      JOIN 
        companies c ON u.company_id = c.id
      WHERE 
        u.username = $1
    `;

    const userResult = await pool.query(userQuery, [username]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        errMsg: "Invalid username or password",
      });
    }

    const user = userResult.rows[0];
    
    // Debug log to check what's in the user object
    console.log("User from database:", user);

    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        errMsg: "Invalid username or password",
      });
    }

    // Ensure user_type exists, default to COMPANY_USER if not
    const userType = user.user_type || "COMPANY_USER";

    // Generate JWT token with company ID and user type
    const token = jwt.sign(
      {
        userId: user.id,
        companyId: user.company_id,
        userType: userType
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Create response object
    const responseData = {
      token,
      user: {
        id: user.id,
        name: user.name,
        user_type: userType,
        companyId: user.company_id,
        company_name: user.company_name,
      }
    };
    
    // Debug log the response we're sending
    console.log("Response being sent:", responseData);

    res.json({
      success: true,
      data: responseData,
      errMsg: null,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      errMsg: "Server error during login",
    });
  }
};

/**
 * User signup
 */
const signup = async (req, res) => {
  try {
    const { username, password, name, company_name, inviteCode } = req.body;

    // Validate required fields
    if (!username || !password || !name) {
      return res.status(400).json({
        success: false,
        errMsg: "Username, password and name are required",
      });
    }

    // Check if username already exists
    const usernameCheckQuery = "SELECT id FROM users WHERE username = $1";
    const usernameCheckResult = await pool.query(usernameCheckQuery, [username]);

    if (usernameCheckResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        errMsg: "Username already exists",
      });
    }

    let companyId = null;
    let userType = inviteCode ? "CUSTOMER" : "COMPANY_USER";
    let companyName = company_name;

    // Start transaction
    try {
      await pool.query("BEGIN");

      if (inviteCode) {
        // If invite code exists, get company details from product_list_meta
        const inviteQuery = `
          SELECT plm.company_id, c.name
          FROM product_list_meta plm
          JOIN companies c ON plm.company_id = c.id
          WHERE plm.invite_code = $1
        `;
        const inviteResult = await pool.query(inviteQuery, [inviteCode]);

        if (inviteResult.rows.length === 0) {
          throw new Error("Invalid invite code");
        }

        companyId = inviteResult.rows[0].company_id;
        companyName = inviteResult.rows[0].name;
        userType = "CUSTOMER"; // Set as customer for invited users
      } else {
        // If no invite code, create new company
        if (!companyName) {
          throw new Error("Company name is required for new accounts");
        }

        const createCompanyQuery = `
          INSERT INTO companies (name) 
          VALUES ($1) 
          RETURNING id
        `;
        const companyResult = await pool.query(createCompanyQuery, [companyName]);
        companyId = companyResult.rows[0].id;

        // Create company partitions
        await pool.query('SELECT create_company_partitions($1)', [companyId]);
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create user
      const createUserQuery = `
        INSERT INTO users (
          company_id, 
          name, 
          username, 
          password, 
          user_type
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, user_type
      `;

      const userResult = await pool.query(createUserQuery, [
        companyId,
        name,
        username,
        hashedPassword,
        userType
      ]);

      const user = userResult.rows[0];

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          companyId: companyId,
          userType: user.user_type
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      await pool.query("COMMIT");

      res.status(201).json({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            name: user.name,
            company_id: companyId,
            company_name: companyName,
            user_type: user.user_type
          }
        },
        errMsg: null
      });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("Error during signup:", error);
      res.status(400).json({
        success: false,
        errMsg: error.message || "Error during signup"
      });
    }
  } catch (error) {
    console.error("Error during signup:", error);
    res.status(500).json({
      success: false,
      errMsg: "Server error during signup"
    });
  }
};

const getCopanyDetailsForInviteCode = async (req, res) => {
  // wrap in try catch
  try {
    const { inviteCode } = req.params;
    const inviteQuery = `SELECT c.id as company_id, c.name as company_name, plm.product_list_id FROM product_list_meta plm JOIN companies c ON plm.company_id = c.id WHERE plm.invite_code = $1`;
    const inviteResult = await pool.query(inviteQuery, [inviteCode]);
    if (inviteResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        errMsg: "Invalid invite code",
      });
    }
    res.json({
      success: true,
      data: inviteResult.rows[0],
      errMsg: null,
    });
  } catch (error) {
    console.error("Error during getCopanyDetailsForInviteCode:", error);
    res.status(500).json({
      success: false,
      errMsg: "Server error during getCopanyDetailsForInviteCode",
    });
  }
};

const checkInviteCodeValidity = async (req, res) => {
  try {
    const { inviteCode } = req.params;
    
    if (!inviteCode) {
      return res.status(400).json({
        success: false,
        data: { isValid: false },
        errMsg: "Invite code is required"
      });
    }
    
    const validityQuery = `
      SELECT EXISTS (
        SELECT 1 FROM product_list_meta 
        WHERE invite_code = $1 
        AND is_invite_expired = FALSE
      ) as is_valid
    `;
    
    const result = await pool.query(validityQuery, [inviteCode]);
    const isValid = result.rows[0]?.is_valid || false;
    
    return res.json({
      success: true,
      data: { isValid },
      errMsg: null
    });
  } catch (error) {
    console.error("Error checking invite code validity:", error);
    return res.status(500).json({
      success: false,
      data: { isValid: false },
      errMsg: "Server error while checking invite code validity"
    });
  }
};

module.exports = {
  login,
  signup,
  getCopanyDetailsForInviteCode,
  checkInviteCodeValidity
};
