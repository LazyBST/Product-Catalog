"use client";

import React from "react";
import { Container, Stack, Box } from "@mui/material";
import FirstTable from "@/components/dashboard/FirstTable";
import SecondTable from "@/components/dashboard/SecondTable";
import UploadSection from "@/components/dashboard/UploadSection";
import { useAuth } from "@/hooks/useAuth";

export default function Dashboard() {
  const { user } = useAuth();
  console.log({ user });
  return (
    <Box>
      <Container maxWidth="lg">
        <Stack spacing={6}>
          {user?.user_type?.toLowerCase() !== "customer" && (
            <>
              {user?.user_type?.toLowerCase() !== "customer" && <FirstTable />}
              {user?.user_type?.toLowerCase() !== "customer" && <SecondTable />}
            </>
          )}
          <UploadSection />
        </Stack>
      </Container>
    </Box>
  );
}
