import { isDevicePath } from "../src/output";

describe("isDevicePath", () => {
  test.each(["/dev/null", "/dev/stdout", "/dev/fd/3", "/proc/self/fd/1"])("treats %s as a device on POSIX", (path) => {
    expect(isDevicePath(path, "linux")).toBe(true);
    expect(isDevicePath(path, "darwin")).toBe(true);
  });

  test.each(["out.gron", "/tmp/dev/null", "devices/null", "NUL"])("treats %s as a file on POSIX", (path) => {
    expect(isDevicePath(path, "linux")).toBe(false);
  });

  test.each(["NUL", "nul", "NUL.txt", "C:\\work\\nul", "D:con", "sub/CON.json", "COM1", "lpt9.log", "\\\\.\\NUL", "//./pipe/name", "conout$"])(
    "treats %s as a device on Windows",
    (path) => {
      expect(isDevicePath(path, "win32")).toBe(true);
    },
  );

  test.each(["out.gron", "C:\\work\\null.json", "nullable", "console.log", "COM0", "\\\\?\\C:\\long\\out.gron", "\\\\server\\share\\out.gron"])(
    "treats %s as a file on Windows",
    (path) => {
      expect(isDevicePath(path, "win32")).toBe(false);
    },
  );
});
