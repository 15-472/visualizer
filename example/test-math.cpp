#include <cmath>
#include <cstdint>
#include <chrono>
#include <iostream>
#include <fstream>
#include <bit>
#include <random>

constexpr uint32_t COUNT = 1000000;

#define HEAP
#ifdef HEAP
//these will eventually be COUNT elements long
float *A = nullptr;
float *B = nullptr;
float *C = nullptr;
#else
std::array< float, COUNT > A;
std::array< float, COUNT > B;
std::array< float, COUNT > C;
#endif

void test_copy() {
	for (uint32_t i = 0; i < COUNT; ++i) {
		C[i] = A[i];
	}
}

void test_add() {
	for (uint32_t i = 0; i < COUNT; ++i) {
		C[i] = A[i] + B[i];
	}
}

void test_mul() {
	for (uint32_t i = 0; i < COUNT; ++i) {
		C[i] = A[i] * B[i];
	}
}

void test_div() {
	for (uint32_t i = 0; i < COUNT; ++i) {
		C[i] = A[i] / B[i];
	}
}

void test_sqrt() {
	for (uint32_t i = 0; i < COUNT; ++i) {
		C[i] = std::sqrt(A[i]);
	}
}

uint32_t checksum = 0;

void accumulate_checksum() {
	for (uint32_t i = 0; i < COUNT; ++i) {
		checksum ^= std::bit_cast< uint32_t >(C[i]);
	}
}


void test(bool report) {
	{
		auto before = std::chrono::high_resolution_clock::now();
		test_copy();
		auto after = std::chrono::high_resolution_clock::now();
		if (report) std::cout << "REPORT " REPORT_PREFIX "copy.x" << COUNT << " " << std::chrono::duration< double >(after - before).count() * 1000.0 << "ms" << std::endl;
		accumulate_checksum();
	}
	{
		auto before = std::chrono::high_resolution_clock::now();
		test_add();
		auto after = std::chrono::high_resolution_clock::now();
		if (report) std::cout << "REPORT " REPORT_PREFIX "add-first.x" << COUNT << " " << std::chrono::duration< double >(after - before).count() * 1000.0 << "ms" << std::endl;
		accumulate_checksum();
	}
	{
		auto before = std::chrono::high_resolution_clock::now();
		test_add();
		auto after = std::chrono::high_resolution_clock::now();
		if (report) std::cout << "REPORT " REPORT_PREFIX "add-second.x" << COUNT << " " << std::chrono::duration< double >(after - before).count() * 1000.0 << "ms" << std::endl;
		accumulate_checksum();
	}

	{
		auto before = std::chrono::high_resolution_clock::now();
		test_mul();
		auto after = std::chrono::high_resolution_clock::now();
		if (report) std::cout << "REPORT " REPORT_PREFIX "mul.x" << COUNT << " " << std::chrono::duration< double >(after - before).count() * 1000.0 << "ms" << std::endl;
		accumulate_checksum();
	}
	{
		auto before = std::chrono::high_resolution_clock::now();
		test_div();
		auto after = std::chrono::high_resolution_clock::now();
		if (report) std::cout << "REPORT " REPORT_PREFIX "div.x" << COUNT << " " << std::chrono::duration< double >(after - before).count() * 1000.0 << "ms" << std::endl;
		accumulate_checksum();
	}
	{
		auto before = std::chrono::high_resolution_clock::now();
		test_sqrt();
		auto after = std::chrono::high_resolution_clock::now();
		if (report) std::cout << "REPORT " REPORT_PREFIX "sqrt.x" << COUNT << " " << std::chrono::duration< double >(after - before).count() * 1000.0 << "ms" << std::endl;
		accumulate_checksum();
	}
}

int main(int argc, char **argv) {
	std::cout << "Testing some things like:" << std::endl;
	std::cout << "multiple\nnew\nlines" << std::endl;
	std::cout << "\ttabs\ttabs\ttabs \t\tyes tabs" << std::endl;
	std::cout << "unicode:" << std::endl;
	std::cout << "  one-byte: hello!\n";
	std::cout << "  two-byte: \xc2\xa7 (section sign)\n";
	std::cout << "  three-byte: \xe2\xac\xa1 (hexagon) \xe2\x84\xb5 (aleph)\n";
	std::cout << "  four-byte: \xf0\x9d\x84\x9e (treble clef)\n";
	std::cout << "  lonely continuation bytes:\x83\xA7 (invalid)\n";
	std::cout << "  two-byte missing continuation: \xc2x (invalid)\n";
	std::cout << "  three-byte missing continuation: \xe2x (invalid) \xe2\x84x (also invalid)\n";
	std::cout << "  four-byte missing continuation: \xf0\x9d\x84x (invalid) \xf0\x9dx (still invalid) \xf0x (also invalid)\n";
	std::cout.flush();

#ifdef HEAP
	A = (float *)std::aligned_alloc(16, sizeof(float) * COUNT);
	B = (float *)std::aligned_alloc(16, sizeof(float) * COUNT);
	C = (float *)std::aligned_alloc(16, sizeof(float) * COUNT);
#endif

	{ //write testing data to disk: (a way of "hiding" the constant nature of the data from the compiler)
		std::mt19937 mt(0xcafe3141);
		for (uint32_t i = 0; i < COUNT; ++i) {
			A[i] = mt() / float(mt.max()) + 1.0f;
		}
		for (uint32_t i = 0; i < COUNT; ++i) {
			B[i] = mt() / float(mt.max()) + 1.0f;
		}

		std::ofstream out("random.flt", std::ios::binary);
		out.write(reinterpret_cast< char * >(&A[0]), sizeof(float) * COUNT);
		out.write(reinterpret_cast< char * >(&B[0]), sizeof(float) * COUNT);
	}

	{ //load data back from disk:
		std::ifstream in("random.flt", std::ios::binary);

		in.read(reinterpret_cast< char * >(&A[0]), sizeof(float) * COUNT);
		in.read(reinterpret_cast< char * >(&B[0]), sizeof(float) * COUNT);

		if (!in) {
			std::cerr << "Failed to read random data." << std::endl;
			return 1;
		}
	}

	for (uint32_t iter = 0; iter < 100; ++iter) {
		test(true);
	}

	std::cout << "Checksum " << checksum << std::endl;

#ifdef HEAP
	std::free(A); A = nullptr;
	std::free(B); B = nullptr;
	std::free(C); C = nullptr;
#endif

	return 0;
}
