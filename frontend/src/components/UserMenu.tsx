import React, { useState } from 'react';
import { IconButton, Menu, MenuItem, Avatar, Typography, Divider } from '@mui/material';
import { useRouter } from 'next/navigation';
import api from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

interface UserMenuProps {
  userName: string;
  companyName?: string;
}

const UserMenu: React.FC<UserMenuProps> = ({ userName, companyName }) => {
  const router = useRouter();
  const { setAuthState } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSignOut = () => {
    // Clear auth state
    setAuthState(false, null, null);
    
    // Clear local storage
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    localStorage.removeItem('companyName');
    
    // Call API logout
    api.logout();
    
    // Close menu
    handleClose();
    
    // Redirect to login page
    router.push('/login');
  };

  return (
    <>
      <IconButton
        onClick={handleClick}
        size="small"
        aria-controls={open ? 'user-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        sx={{ ml: 2 }}
      >
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
          {userName.charAt(0).toUpperCase()}
        </Avatar>
      </IconButton>
      <Menu
        id="user-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        PaperProps={{
          elevation: 0,
          sx: {
            overflow: 'visible',
            filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
            mt: 1.5,
            minWidth: 200,
            '& .MuiAvatar-root': {
              width: 32,
              height: 32,
              ml: -0.5,
              mr: 1,
            },
          },
        }}
      >
        <MenuItem disabled>
          <Typography variant="body2" color="textSecondary">
            Signed in as {userName}
          </Typography>
        </MenuItem>
        {companyName && (
          <MenuItem disabled>
            <Typography variant="body2" color="textSecondary">
              Company: {companyName}
            </Typography>
          </MenuItem>
        )}
        <Divider />
        <MenuItem onClick={handleSignOut}>Sign Out</MenuItem>
      </Menu>
    </>
  );
};

export default UserMenu; 