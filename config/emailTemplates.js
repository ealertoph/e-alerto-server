export const EMAIL_VERIFY_TEMPLATE = `
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">

<head>
  <title>Email Verify</title>
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&display=swap" rel="stylesheet" type="text/css">
  <style type="text/css">
    body { margin:0; padding:0; font-family:'Open Sans', sans-serif; background:#E5E5E5; }
    table, td { border-collapse:collapse; }
    .container { width:100%; max-width:500px; margin:70px 0px; background-color:#ffffff; }
    .main-content { padding:48px 30px 40px; color:#000000; text-align:center; }
    .button { width:100%; background:#1E3A8A; text-decoration:none; display:inline-block; padding:10px 0; color:#fff; font-size:14px; text-align:center; font-weight:bold; border-radius:7px; }
    .header-text { font-size:22px; font-weight:bold; margin-bottom:10px; }
    .brand-text { font-size:24px; font-weight:bold; color:#1E3A8A; margin-bottom:20px; }
    @media only screen and (max-width:480px) {
      .container { width:80% !important; }
      .button { width:50% !important; }
    }
  </style>
</head>

<body>
  <table width="100%" cellspacing="0" cellpadding="0" border="0" align="center" bgcolor="#F6FAFB">
    <tbody>
      <tr>
        <td valign="top" align="center">
          <table class="container" width="600" cellspacing="0" cellpadding="0" border="0">
            <tbody>
              <tr>
                <td class="main-content">
                  <div class="brand-text">E-ALERTO</div>
                  <div class="header-text">Verify your email</div>
                  <p style="font-size:14px; line-height:1.5; padding-bottom:16px;">
                    You are just one step away to verify your account for this email: <span style="color:#1E3A8A;">{{email}}</span>.
                  </p>
                  <p style="font-size:14px; line-height:1.5; font-weight:700; padding-bottom:16px;">
                    Use the OTP below to verify your account.
                  </p>
                  <p class="button">{{otp}}</p>
                  <p style="font-size:14px; line-height:1.5; padding-top:16px;">
                    This OTP is valid for 24 hours.
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>
`;

export const PASSWORD_RESET_TEMPLATE = `
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">

<head>
  <title>Password Reset</title>
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&display=swap" rel="stylesheet" type="text/css">
  <style type="text/css">
    body { margin:0; padding:0; font-family:'Open Sans', sans-serif; background:#E5E5E5; }
    table, td { border-collapse:collapse; }
    .container { width:100%; max-width:500px; margin:70px 0px; background-color:#ffffff; }
    .main-content { padding:48px 30px 40px; color:#000000; text-align:center; }
    .button { width:100%; background:#1E3A8A; text-decoration:none; display:inline-block; padding:10px 0; color:#fff; font-size:14px; text-align:center; font-weight:bold; border-radius:7px; }
    .header-text { font-size:22px; font-weight:bold; margin-bottom:10px; }
    .brand-text { font-size:24px; font-weight:bold; color:#1E3A8A; margin-bottom:20px; }
    @media only screen and (max-width:480px) {
      .container { width:80% !important; }
      .button { width:50% !important; }
    }
  </style>
</head>

<body>
  <table width="100%" cellspacing="0" cellpadding="0" border="0" align="center" bgcolor="#F6FAFB">
    <tbody>
      <tr>
        <td valign="top" align="center">
          <table class="container" width="600" cellspacing="0" cellpadding="0" border="0">
            <tbody>
              <tr>
                <td class="main-content">
                  <div class="brand-text">E-ALERTO</div>
                  <div class="header-text">Forgot your password?</div>
                  <p style="font-size:14px; line-height:1.5; padding-bottom:16px;">
                    We received a password reset request for your account: <span style="color:#1E3A8A;">{{email}}</span>.
                  </p>
                  <p style="font-size:14px; line-height:1.5; font-weight:700; padding-bottom:16px;">
                    Use the OTP below to reset the password.
                  </p>
                  <p class="button">{{otp}}</p>
                  <p style="font-size:14px; line-height:1.5; padding-top:16px;">
                    The password reset OTP is only valid for the next 15 minutes.
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>
`;
