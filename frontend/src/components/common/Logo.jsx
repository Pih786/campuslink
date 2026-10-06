import { Link } from "react-router-dom";

export function BrandMark({ className = "brand-mark" }) {
  return (
    <img
      className={className}
      src="/logo-mark.png"
      srcSet="/logo-mark.png 1x, /logo-mark@2x.png 2x"
      alt=""
      width={26}
      height={26}
    />
  );
}

function Logo({ to = "/" }) {
  return (
    <Link to={to} className="brand" aria-label="CampusLink home">
      <BrandMark />
      <span>CampusLink</span>
    </Link>
  );
}

export default Logo;
