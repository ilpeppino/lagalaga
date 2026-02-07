#!/bin/bash
#
# Epic 8: Test Runner Script
#
# Convenient script to run different types of tests
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_msg() {
  color=$1
  message=$2
  echo -e "${color}${message}${NC}"
}

# Print header
print_header() {
  echo ""
  print_msg "$BLUE" "=========================================="
  print_msg "$BLUE" "$1"
  print_msg "$BLUE" "=========================================="
  echo ""
}

# Show usage
show_usage() {
  echo "Usage: ./run-tests.sh [option]"
  echo ""
  echo "Options:"
  echo "  all         - Run all tests (unit + integration)"
  echo "  unit        - Run only unit tests"
  echo "  integration - Run only integration tests"
  echo "  coverage    - Run tests with coverage report"
  echo "  watch       - Run tests in watch mode"
  echo "  specific    - Run specific test file (provide filename)"
  echo ""
  echo "Examples:"
  echo "  ./run-tests.sh all"
  echo "  ./run-tests.sh coverage"
  echo "  ./run-tests.sh specific roblox-link-normalizer.test.ts"
  echo ""
}

# Run all tests
run_all() {
  print_header "Running All Tests"
  npm test
}

# Run unit tests only
run_unit() {
  print_header "Running Unit Tests"
  npm test -- __tests__/.*\\.test\\.ts$ --testPathIgnorePatterns=integration
}

# Run integration tests only
run_integration() {
  print_header "Running Integration Tests"
  npm test -- integration
}

# Run tests with coverage
run_coverage() {
  print_header "Running Tests with Coverage"
  npm run test:coverage

  echo ""
  print_msg "$GREEN" "Coverage report generated!"
  print_msg "$YELLOW" "Open coverage/lcov-report/index.html to view detailed report"
  echo ""
}

# Run tests in watch mode
run_watch() {
  print_header "Running Tests in Watch Mode"
  print_msg "$YELLOW" "Tests will re-run when files change. Press Ctrl+C to exit."
  echo ""
  npm run test:watch
}

# Run specific test file
run_specific() {
  if [ -z "$2" ]; then
    print_msg "$RED" "Error: Please provide a test file name"
    echo ""
    echo "Example: ./run-tests.sh specific roblox-link-normalizer.test.ts"
    exit 1
  fi

  print_header "Running Specific Test: $2"
  npm test -- "$2"
}

# Main script logic
main() {
  # Check if npm is available
  if ! command -v npm &> /dev/null; then
    print_msg "$RED" "Error: npm is not installed"
    exit 1
  fi

  # Check if in correct directory
  if [ ! -f "package.json" ]; then
    print_msg "$RED" "Error: Must be run from backend directory"
    exit 1
  fi

  # Parse command
  case "$1" in
    all)
      run_all
      ;;
    unit)
      run_unit
      ;;
    integration)
      run_integration
      ;;
    coverage)
      run_coverage
      ;;
    watch)
      run_watch
      ;;
    specific)
      run_specific "$@"
      ;;
    help|--help|-h|"")
      show_usage
      ;;
    *)
      print_msg "$RED" "Error: Unknown option '$1'"
      echo ""
      show_usage
      exit 1
      ;;
  esac

  # Show summary on success
  if [ $? -eq 0 ] && [ "$1" != "watch" ]; then
    echo ""
    print_msg "$GREEN" "✅ Tests completed successfully!"
    echo ""
  fi
}

# Run main with all arguments
main "$@"
