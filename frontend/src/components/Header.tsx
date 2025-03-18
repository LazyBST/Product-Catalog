import React from 'react';
import { AppBar, Toolbar, Typography, Box } from '@mui/material';
import UserMenu from './UserMenu';
import { useAuth } from '@/contexts/AuthContext';

const Header: React.FC = () => {
  const { isLoggedIn, userName, companyName } = useAuth();

  return (
    <AppBar position="static" color="default" elevation={1} sx={{mb: 6}}>
      <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
        {/* Left spacer */}
        <Box sx={{ width: 48 }} /> {/* Width matches the user menu icon */}
        
        {/* Centered title */}
        <Typography 
          variant="h5" 
          component="div" 
          sx={{ 
            fontWeight: 'bold',
            color: 'primary.main',
            textAlign: 'center'
          }}
        >
          AI-ventory
        </Typography>
        
        {/* Right-aligned user menu or spacer */}
        <Box sx={{ width: 48, display: 'flex', justifyContent: 'flex-end' }}>
          {isLoggedIn && userName && (
            <UserMenu userName={userName} companyName={companyName || ''} />
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header; 