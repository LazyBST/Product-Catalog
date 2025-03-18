"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Container,
  TextField,
  Button,
  Typography,
  Paper,
  Stack,
  CircularProgress,
  Alert,
} from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("inviteCode");

  const { setAuthState } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteCodeValid, setInviteCodeValid] = useState<boolean | null>(inviteCode ? null : true);
  const [checkingInviteCode, setCheckingInviteCode] = useState(!!inviteCode);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      setError("Username and password are required");
      return;
    }

    if (inviteCode && !inviteCodeValid) {
      setError("Invalid or expired invite code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await api.login({ username, password });

      // Debug log the response
      console.log("Login API response:", response);

      if (response.success && response.data) {
        // Log the user object to check if user_type exists
        console.log("User data from login:", response.data.user);

        setAuthState(
          true,
          response.data.user.name,
          response.data.user.company_name,
          response.data.user.user_type || "COMPANY_USER"
        );

        // Preserve all query parameters when redirecting
        const queryParams = new URLSearchParams(window.location.search);
        const redirectUrl = queryParams.toString()
          ? `/dashboard?${queryParams.toString()}`
          : "/dashboard";
        router.push(redirectUrl);
      } else {
        setError(response.errMsg || "Login failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      setError("An error occurred during login");
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setUsername("guest_user");
    setPassword("guest_password");

    setLoading(true);
    setError("");

    try {
      const response = await api.login({
        username: "guest_user",
        password: "guest_password",
      });

      console.log("Guest login successful with inviteCode:", inviteCode);

      if (response.success && response.data) {
        setAuthState(
          true,
          response.data.user.name,
          response.data.user.company_name,
          response.data.user.user_type || "COMPANY_USER"
        );

        // Preserve all query parameters when redirecting
        const queryParams = new URLSearchParams(window.location.search);
        const redirectUrl = queryParams.toString()
          ? `/dashboard?${queryParams.toString()}`
          : "/dashboard";
        router.push(redirectUrl);
      } else {
        setError(response.errMsg || "Guest login failed");
      }
    } catch (error) {
      console.error("Guest login error:", error);
      setError("An error occurred during guest login");
    } finally {
      setLoading(false);
    }
  };

  const goToSignup = () => {
    const signupUrl = inviteCode
      ? `/signup?inviteCode=${inviteCode}`
      : "/signup";
    router.push(signupUrl);
  };

  // Check if invite code is valid
  const checkInviteCodeValidity = async () => {
    if (!inviteCode) return;
    
    setCheckingInviteCode(true);
    try {
      const response = await api.checkInviteCodeValidity(inviteCode);
      console.log("Invite code validity:", response);
      
      if (response.success && response.data) {
        setInviteCodeValid(response.data.isValid);
        if (!response.data.isValid) {
          setError("The invite code is invalid or has expired");
        }
      } else {
        setInviteCodeValid(false);
        setError("Could not verify invite code");
      }
    } catch (err) {
      console.error("Error checking invite code:", err);
      setInviteCodeValid(false);
      setError("Error validating invite code");
    } finally {
      setCheckingInviteCode(false);
    }
  };

  // Call checkInviteCodeValidity when the page loads
  useEffect(() => {
    if (!inviteCode) return;
    checkInviteCodeValidity();
  }, [inviteCode]);

  // Show loading state while checking invite code
  if (checkingInviteCode) {
    return (
      <Container maxWidth="sm">
        <Box
          sx={{
            mt: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Typography
            variant="h4"
            component="h1"
            sx={{
              mb: 4,
              fontWeight: "bold",
              color: "primary.main",
            }}
          >
            AI-ventory
          </Typography>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Validating invite code...</Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          mt: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Typography
          variant="h4"
          component="h1"
          sx={{
            mb: 4,
            fontWeight: "bold",
            color: "primary.main",
          }}
        >
          AI-ventory
        </Typography>

        <Paper elevation={3} sx={{ p: 4, width: "100%" }}>
          <Typography
            variant="h5"
            component="h2"
            sx={{ mb: 3, textAlign: "center" }}
          >
            Login
          </Typography>

          {inviteCode && inviteCodeValid === false && (
            <Alert severity="error" sx={{ mb: 2 }}>
              This invite code is invalid or has expired. Please contact your administrator.
            </Alert>
          )}

          {error && (
            <Typography color="error" sx={{ mb: 2 }}>
              {error}
            </Typography>
          )}

          <Box component="form" onSubmit={handleLogin}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="username"
              label="Username"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading || (!!inviteCode && inviteCodeValid === false)}
            />

            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading || (!!inviteCode && inviteCodeValid === false)}
            />

            <Stack spacing={2} sx={{ mt: 3 }}>
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading || (!!inviteCode && inviteCodeValid === false)}
              >
                {loading ? <CircularProgress size={24} /> : "Login"}
              </Button>

              {/* Only show guest login when no invite code is present */}
              {!inviteCode && (
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={handleGuestLogin}
                  disabled={loading}
                >
                  Guest Login
                </Button>
              )}

              <Button
                fullWidth
                color="secondary"
                onClick={goToSignup}
                disabled={loading || (!!inviteCode && inviteCodeValid === false)}
              >
                Sign Up
              </Button>
            </Stack>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
