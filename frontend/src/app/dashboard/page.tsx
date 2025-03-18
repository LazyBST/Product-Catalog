"use client";

import React, { useEffect, useState } from "react";
import {
  Container,
  Box,
  Grid,
  Paper,
  Typography,
  CircularProgress,
} from "@mui/material";
import FirstTable from "@/components/dashboard/FirstTable";
import SecondTable from "@/components/dashboard/SecondTable";
import UploadSection from "@/components/dashboard/UploadSection";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";

export default function Dashboard() {
  const { isLoggedIn, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("inviteCode");
  const [redirecting, setRedirecting] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoggedIn) {
      router.push("/login");
    }
  }, [isLoggedIn, router]);

  // Handle invite code
  useEffect(() => {
    // If there's an invite code and user is not logged in, redirect to signup
    if (inviteCode && !isLoggedIn) {
      setRedirecting(true);
      router.push(`/signup?inviteCode=${inviteCode}`);
    }
  }, [inviteCode, isLoggedIn, router]);

  // Show loading while checking auth or redirecting
  if (!isLoggedIn || redirecting) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ mt: 4, mb: 2, display: "flex", justifyContent: "center" }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  const isCustomer = user?.user_type?.toUpperCase() === "CUSTOMER";
  const shouldShowUpload = (isCustomer && !!inviteCode) || !isCustomer;

  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 4, mb: 2 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Dashboard
        </Typography>
      </Box>

      {!isCustomer && (
        <>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" component="h2" gutterBottom>
                  Your Product Lists
                </Typography>
                <FirstTable />
              </Paper>
            </Grid>

            <Grid item xs={12}>
              <Paper sx={{ p: 2, mt: 3 }}>
                <Typography variant="h6" component="h2" gutterBottom>
                  Recent Product Lists
                </Typography>
                <SecondTable />
              </Paper>
            </Grid>
          </Grid>
        </>
      )}

      {/* Only show upload section to customers with an invite code or users that are not customers */}
      {shouldShowUpload && <UploadSection />}
    </Container>
  );
}
