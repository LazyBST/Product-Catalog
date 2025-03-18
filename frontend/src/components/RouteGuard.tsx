import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

// List of public paths that don't require authentication
const publicPaths = ['/login', '/signup'];

// List of paths that are product-specific and need special handling
const productPaths = ['/products'];

const RouteGuard = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    // Function to check if the path is public
    const isPublicPath = () => {
      return publicPaths.includes(pathname);
    };

    // Function to check if the path is a product path
    const isProductPath = () => {
      return productPaths.some(path => pathname.startsWith(path));
    };

    // Check authentication
    const checkAuth = () => {
      if (!isLoggedIn && !isPublicPath() && !isProductPath()) {
        // Redirect to login page if not authenticated and trying to access a protected route
        // attach whatever query params are in the url to the redirect url
        const queryParams = new URLSearchParams(window.location.search);
        const redirectUrl = `/login?${queryParams.toString()}`;
        router.push(redirectUrl);
      } else if (isLoggedIn && isPublicPath()) {
        // Redirect to dashboard if authenticated and trying to access public routes
        router.push('/dashboard');
      }
    };

    checkAuth();
  }, [isLoggedIn, pathname, router]);

  return <>{children}</>;
};

export default RouteGuard; 